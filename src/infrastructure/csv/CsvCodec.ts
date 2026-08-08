import type { ProjectFileCodec, SerializedProjectFile } from '../../application/ports/ProjectFileCodec'
import type { Project } from '../../domain/entities/Project'
import { Task } from '../../domain/entities/Task'
import type { TaskConstraintType } from '../../domain/entities/Task'
import { Resource } from '../../domain/entities/Resource'
import type { ResourceType } from '../../domain/entities/Resource'
import { Dependency } from '../../domain/entities/Dependency'
import { WorkCalendar } from '../../domain/entities/WorkCalendar'
import { Duration } from '../../domain/value-objects/Duration'
import { Money } from '../../domain/value-objects/Money'
import {
  asTaskId,
  asResourceId,
  asDependencyId,
  asCalendarId,
  asProjectId,
} from '../../domain/value-objects/Ids'
import type { IdGenerator } from '../../application/ports/IdGenerator'
import {
  formatPredecessors,
  parsePredecessorsField,
} from '../../application/services/PredecessorNotation'
import { refreshProject } from '../../application/services/ProjectRefresh'

export type CsvEntityType = 'task' | 'resource'

export interface CsvColumnMapping {
  sourceColumn: string
  targetField: string
}

export type DateFormat = 'iso' | 'us' | 'eu'

export interface CsvImportOptions {
  entityType: CsvEntityType
  dateFormat: DateFormat
  columnMappings: CsvColumnMapping[]
  hasHeader: boolean
}

export interface CsvImportError {
  row: number
  column: string | null
  message: string
}

export interface CsvImportResult {
  tasks: Task[]
  resources: Resource[]
  dependencies: Dependency[]
  errors: CsvImportError[]
  rowsImported: number
  rowsSkipped: number
}

// ---- CSV parsing helpers --------------------------------------------------

function detectEncoding(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8'
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return 'utf-16le'
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return 'utf-16be'
  }
  return 'utf-8'
}

function decodeContent(buffer: ArrayBuffer, encoding: string): string {
  try {
    return new TextDecoder(encoding).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

function detectDelimiter(headerLine: string): string {
  const candidates = [',', '\t', ';']
  let best = ','
  let bestCount = 0
  for (const c of candidates) {
    const count = (headerLine.match(new RegExp(escapeRegex(c), 'g')) || []).length
    if (count > bestCount) {
      bestCount = count
      best = c
    }
  }
  return bestCount > 0 ? best : ','
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Parse a single CSV line respecting RFC 4180 quoted fields. */
function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delimiter) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current.trim())
  return fields
}

/** Parse full CSV text into rows. Handles multiline quoted fields. */
function parseCsv(text: string, delimiter?: string): { headers: string[]; rows: string[][]; delimiter: string } {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Detect delimiter from first line if not provided
  const firstNewline = normalized.indexOf('\n')
  const firstLine = firstNewline >= 0 ? normalized.slice(0, firstNewline) : normalized
  const delim = delimiter ?? detectDelimiter(firstLine)

  // Parse with multiline quoted field support
  const allFields: string[][] = []
  let currentFields: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < normalized.length && normalized[i + 1] === '"') {
          currentField += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        currentField += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delim) {
        currentFields.push(currentField.trim())
        currentField = ''
      } else if (ch === '\n') {
        currentFields.push(currentField.trim())
        allFields.push(currentFields)
        currentFields = []
        currentField = ''
      } else {
        currentField += ch
      }
    }
  }
  // Don't forget the last field and row
  currentFields.push(currentField.trim())
  if (currentFields.length > 0 && currentFields.some((f) => f !== '')) {
    allFields.push(currentFields)
  }

  if (allFields.length === 0) {
    return { headers: [], rows: [], delimiter: delim }
  }

  const headers = allFields[0]!
  const rows = allFields.slice(1)
  return { headers, rows, delimiter: delim }
}

// ---- Date parsing ---------------------------------------------------------

function parseDateIso(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseDateUs(value: string): Date | null {
  // MM/DD/YYYY or M/D/YYYY
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseDateEu(value: string): Date | null {
  // DD/MM/YYYY or D/M/YYYY
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseDateWithFormat(value: string, format: DateFormat): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  switch (format) {
    case 'iso':
      return parseDateIso(trimmed)
    case 'us':
      return parseDateUs(trimmed)
    case 'eu':
      return parseDateEu(trimmed)
  }
}

// ---- CSV value parsing helpers --------------------------------------------

function parseNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

function parseBoolean(value: string): boolean | null {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  return trimmed === 'true' || trimmed === '1' || trimmed === 'yes' || trimmed === 'y'
}

function parseConstraintType(value: string): TaskConstraintType {
  const trimmed = value.trim().toLowerCase()
  const map: Record<string, TaskConstraintType> = {
    'as soon as possible': 'asSoonAsPossible',
    'as late as possible': 'asLateAsPossible',
    'must start on': 'mustStartOn',
    'must finish on': 'mustFinishOn',
    'start no earlier than': 'startNoEarlierThan',
    'start no later than': 'startNoLaterThan',
    'finish no earlier than': 'finishNoEarlierThan',
    'finish no later than': 'finishNoLaterThan',
    assoonaspossible: 'asSoonAsPossible',
    aslateaspossible: 'asLateAsPossible',
    muststarton: 'mustStartOn',
    mustfinishon: 'mustFinishOn',
    startnoearlierthan: 'startNoEarlierThan',
    startnolaterthan: 'startNoLaterThan',
    finishnoearlierthan: 'finishNoEarlierThan',
    finishnolaterthan: 'finishNoLaterThan',
  }
  return map[trimmed.replace(/\s+/g, '')] ?? 'asSoonAsPossible'
}

function parseResourceType(value: string): ResourceType {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'material' || trimmed === 'cost') return trimmed
  return 'work'
}

function parseDurationValue(value: string): Duration {
  const trimmed = value.trim()
  if (!trimmed) return Duration.zero()
  // Try Duration.parse first
  try {
    return Duration.parse(trimmed)
  } catch {
    // Fallback: plain number = days
    const n = Number(trimmed.replace(/,/g, ''))
    if (Number.isFinite(n)) {
      return Duration.of(n, 'd')
    }
    return Duration.zero()
  }
}

// ---- Field name constants -------------------------------------------------

const TASK_FIELD_NAMES = [
  'name',
  'wbs',
  'outlineLevel',
  'start',
  'finish',
  'duration',
  'percentComplete',
  'milestone',
  'notes',
  'priority',
  'constraintType',
  'constraintDate',
  'fixedCost',
  'predecessors',
] as const

type TaskFieldName = (typeof TASK_FIELD_NAMES)[number]

const RESOURCE_FIELD_NAMES = [
  'name',
  'type',
  'group',
  'maxUnits',
  'standardRate',
  'overtimeRate',
  'costPerUse',
  'notes',
  'calendar',
  'email',
] as const

type ResourceFieldName = (typeof RESOURCE_FIELD_NAMES)[number]

function normalizeFieldLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '')
}

// ---- Export helpers -------------------------------------------------------

const BOM = '﻿'

/** Escape a CSV field for RFC 4180 compliance. Comma-delimited only. */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatDateCsv(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDurationCsv(duration: Duration): string {
  const days = duration.toDays()
  if (days === 0) return '0'
  return String(Math.round(days * 100) / 100)
}

function constraintTypeLabel(ct: TaskConstraintType): string {
  const map: Record<TaskConstraintType, string> = {
    asSoonAsPossible: 'As Soon As Possible',
    asLateAsPossible: 'As Late As Possible',
    mustStartOn: 'Must Start On',
    mustFinishOn: 'Must Finish On',
    startNoEarlierThan: 'Start No Earlier Than',
    startNoLaterThan: 'Start No Later Than',
    finishNoEarlierThan: 'Finish No Earlier Than',
    finishNoLaterThan: 'Finish No Later Than',
  }
  return map[ct]
}

// ---- The Codec ------------------------------------------------------------

export class CsvCodec implements ProjectFileCodec {
  readonly supportedExtensions = ['.csv'] as const
  private readonly entityType: CsvEntityType

  constructor(
    private readonly ids: IdGenerator,
    entityType: CsvEntityType = 'task',
  ) {
    this.entityType = entityType
  }

  canHandle(fileName: string): boolean {
    return fileName.toLowerCase().endsWith('.csv')
  }

  /**
   * Parse CSV content into a Project containing imported tasks or resources.
   * For import into an existing project, use {@link importFromCsv} instead.
   */
  async parse(content: string | ArrayBuffer, fileName: string): Promise<Project> {
    const buffer =
      typeof content === 'string'
        ? new TextEncoder().encode(content).buffer
        : content instanceof ArrayBuffer
          ? content
          : new Uint8Array(content).buffer

    const encoding = detectEncoding(buffer)
    const text = decodeContent(buffer, encoding)

    const { headers, rows } = parseCsv(text)

    if (headers.length === 0) {
      throw new Error('CSV file is empty or has no header row')
    }

    // Auto-detect entity type from column headers
    const headerSet = new Set(headers.map((h) => normalizeFieldLabel(h)))
    const hasStart = headerSet.has('start')
    const hasDuration = headerSet.has('duration')
    const hasMaxUnits = headerSet.has('maxunits') || headerSet.has('max_units') || headerSet.has('max units')

    const detectedType: CsvEntityType =
      hasStart || hasDuration || (!hasMaxUnits && headers.length > 0) ? 'task' : 'resource'

    // Build default column mappings from headers
    const mappings = this.buildDefaultMappings(headers, detectedType)

    const result = this.parseRows(rows, headers, mappings, 'iso', detectedType)

    const now = new Date()
    const calendarId = asCalendarId(this.ids.calendarId())
    const calendar = WorkCalendar.standard(calendarId)

    const project = Project.create({
      id: asProjectId(this.ids.projectId()),
      name: 'Imported CSV',
      title: 'Imported CSV',
      manager: '',
      startDate: result.tasks.length > 0 ? result.tasks[0]!.start : now,
      finishDate: result.tasks.length > 0 ? result.tasks[result.tasks.length - 1]!.finish : now,
      statusDate: null,
      currency: 'USD',
      calendarId,
      tasks: result.tasks,
      resources: result.resources,
      dependencies: result.dependencies,
      assignments: [],
      calendars: [calendar],
      dirty: true,
      fileName,
    })

    return refreshProject(project)
  }

  /**
   * Serialize the project as CSV. For task entity type, exports tasks.
   * For resource entity type, exports resources.
   */
  async serialize(project: Project): Promise<SerializedProjectFile> {
    if (this.entityType === 'resource') {
      return this.serializeResources(project)
    }
    return this.serializeTasks(project)
  }

  private serializeTasks(project: Project): SerializedProjectFile {
    const headers = [
      'WBS',
      'Name',
      'Outline Level',
      'Start',
      'Finish',
      'Duration',
      '% Complete',
      'Milestone',
      'Summary',
      'Predecessors',
      'Resource Names',
      'Cost',
      'Fixed Cost',
      'Notes',
      'Priority',
      'Constraint Type',
      'Constraint Date',
      'Work Hours',
    ]

    const lines: string[] = [headers.join(',')]

    for (const task of project.tasks) {
      const predecessors = formatPredecessors(project, task.id)
      const resourceNames = project.assignments
        .filter((a) => a.taskId === task.id)
        .map((a) => {
          const r = project.resources.find((res) => res.id === a.resourceId)
          return r?.name ?? ''
        })
        .filter(Boolean)
        .join('; ')

      const row = [
        task.wbs,
        task.name,
        String(task.outlineLevel),
        formatDateCsv(task.start),
        formatDateCsv(task.finish),
        formatDurationCsv(task.duration),
        String(task.percentComplete),
        task.milestone ? 'Yes' : 'No',
        task.summary ? 'Yes' : 'No',
        predecessors,
        resourceNames,
        String(task.cost.amount),
        String(task.fixedCost.amount),
        task.notes,
        String(task.priority),
        constraintTypeLabel(task.constraintType),
        task.constraintDate ? formatDateCsv(task.constraintDate) : '',
        String(task.workHours),
      ]
      lines.push(row.map(csvEscape).join(','))
    }

    return {
      content: BOM + lines.join('\r\n'),
      mimeType: 'text/csv',
      extension: '.csv',
    }
  }

  private serializeResources(project: Project): SerializedProjectFile {
    const headers = [
      'Name',
      'Type',
      'Group',
      'Max Units',
      'Standard Rate',
      'Overtime Rate',
      'Cost Per Use',
      'Calendar',
      'Notes',
      'Email',
    ]

    const lines: string[] = [headers.join(',')]

    for (const resource of project.resources) {
      const calendarName = resource.calendarId
        ? project.calendars.find((c) => c.id === resource.calendarId)?.name ?? ''
        : ''

      const row = [
        resource.name,
        resource.type,
        resource.group,
        String(resource.maxUnits),
        String(resource.standardRate.amount),
        String(resource.overtimeRate.amount),
        String(resource.costPerUse.amount),
        calendarName,
        resource.notes,
        resource.email,
      ]
      lines.push(row.map(csvEscape).join(','))
    }

    return {
      content: BOM + lines.join('\r\n'),
      mimeType: 'text/csv',
      extension: '.csv',
    }
  }

  // ---- Import logic -------------------------------------------------------

  /**
   * Import CSV content and return parsed entities. Does NOT create a Project —
   * callers merge the result into their existing project for undoable bulk import.
   */
  static importFromCsv(
    content: string | ArrayBuffer,
    options: CsvImportOptions,
    ids: IdGenerator,
    existingTasks: Task[] = [],
  ): CsvImportResult {
    const buffer =
      typeof content === 'string'
        ? new TextEncoder().encode(content).buffer
        : content instanceof ArrayBuffer
          ? content
          : new Uint8Array(content).buffer

    const encoding = detectEncoding(buffer)
    const text = decodeContent(buffer, encoding)
    const { headers, rows } = parseCsv(text)

    if (headers.length === 0) {
      return { tasks: [], resources: [], dependencies: [], errors: [], rowsImported: 0, rowsSkipped: 0 }
    }

    // When hasHeader is false, the first row parsed as "headers" is actually
    // a data row.  Generate synthetic column labels and prepend that row.
    let effectiveHeaders: string[]
    let effectiveRows: string[][]
    if (options.hasHeader) {
      effectiveHeaders = headers
      effectiveRows = rows
    } else {
      effectiveHeaders = headers.map((_, i) => `Column ${i + 1}`)
      effectiveRows = [headers, ...rows]
    }

    const mappings = options.columnMappings
    const result = new CsvCodec(ids, options.entityType).parseRows(
      effectiveRows,
      effectiveHeaders,
      mappings,
      options.dateFormat,
      options.entityType,
      existingTasks,
    )

    return result
  }

  private buildDefaultMappings(
    headers: string[],
    entityType: CsvEntityType,
  ): CsvColumnMapping[] {
    const fieldNames = entityType === 'task' ? TASK_FIELD_NAMES : RESOURCE_FIELD_NAMES
    const fieldSet = new Set<string>(fieldNames)

    return headers
      .map((header) => {
        const normalized = normalizeFieldLabel(header)
        // Direct match
        if (fieldSet.has(normalized)) {
          return { sourceColumn: header, targetField: normalized }
        }
        // Common aliases
        const alias = this.resolveAlias(normalized, entityType)
        if (alias) {
          return { sourceColumn: header, targetField: alias }
        }
        return null
      })
      .filter((m): m is CsvColumnMapping => m != null)
  }

  private resolveAlias(normalized: string, entityType: CsvEntityType): string | null {
    if (entityType === 'task') {
      const taskAliases: Record<string, string> = {
        taskname: 'name',
        task: 'name',
        title: 'name',
        description: 'notes',
        startdate: 'start',
        finishdate: 'finish',
        enddate: 'finish',
        end: 'finish',
        percentcomplete: 'percentComplete',
        '%complete': 'percentComplete',
        pctcomplete: 'percentComplete',
        completion: 'percentComplete',
        ismilestone: 'milestone',
        is_milestone: 'milestone',
        outlinelevel: 'outlineLevel',
        outline_level: 'outlineLevel',
        level: 'outlineLevel',
        hierarchy: 'outlineLevel',
        durationdays: 'duration',
        duration_days: 'duration',
        estimateduration: 'duration',
        fixedcost: 'fixedCost',
        fixed_cost: 'fixedCost',
        cost: 'fixedCost',
        constrainttype: 'constraintType',
        constraint_type: 'constraintType',
        constraintdate: 'constraintDate',
        constraint_date: 'constraintDate',
        predecessors: 'predecessors',
        pred: 'predecessors',
        deps: 'predecessors',
        dependencies: 'predecessors',
        priority: 'priority',
      }
      return taskAliases[normalized] ?? null
    }

    const resourceAliases: Record<string, string> = {
      resourcename: 'name',
      resource: 'name',
      resourcetype: 'type',
      resource_type: 'type',
      maxunits: 'maxUnits',
      max_units: 'maxUnits',
      units: 'maxUnits',
      standardrate: 'standardRate',
      standard_rate: 'standardRate',
      rate: 'standardRate',
      overtimerate: 'overtimeRate',
      overtime_rate: 'overtimeRate',
      costperuse: 'costPerUse',
      cost_per_use: 'costPerUse',
    }
    return resourceAliases[normalized] ?? null
  }

  private parseRows(
    rows: string[][],
    headers: string[],
    mappings: CsvColumnMapping[],
    dateFormat: DateFormat,
    entityType: CsvEntityType,
    existingTasks: Task[] = [],
  ): CsvImportResult {
    const errors: CsvImportError[] = []
    const entities: (Task | Resource)[] = []
    const dependencies: Dependency[] = []
    const currency = 'USD'
    let skippedCount = 0

    // Build a lookup from source column name → target field
    const mappingMap = new Map<string, string>()
    for (const m of mappings) {
      mappingMap.set(m.sourceColumn, m.targetField)
    }

    // Build a row value getter: header index → field value
    const headerIndex = new Map<string, number>()
    headers.forEach((h, i) => headerIndex.set(h, i))

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx]!
      // Skip fully empty rows
      if (row.every((f) => f === '')) continue

      const values = new Map<string, string>()
      for (const [sourceCol, targetField] of mappingMap) {
        const idx = headerIndex.get(sourceCol)
        if (idx !== undefined && idx < row.length) {
          values.set(targetField, row[idx] ?? '')
        }
      }

      if (entityType === 'task') {
        try {
          const task = this.parseTaskRow(values, rowIdx, dateFormat, currency, errors, existingTasks)
          if (task) {
            entities.push(task)
          } else {
            skippedCount++
          }
        } catch {
          errors.push({ row: rowIdx + 2, column: null, message: 'Failed to parse task row' })
          skippedCount++
        }
      } else {
        try {
          const resource = this.parseResourceRow(values, rowIdx, currency, errors)
          if (resource) {
            entities.push(resource)
          } else {
            skippedCount++
          }
        } catch {
          errors.push({ row: rowIdx + 2, column: null, message: 'Failed to parse resource row' })
          skippedCount++
        }
      }
    }

    const tasks = entities.filter((e): e is Task => e instanceof Task)
    const resources = entities.filter((e): e is Resource => e instanceof Resource)

    // Resolve predecessors from the predecessor column
    const allTasks = [...existingTasks, ...tasks]
    const predMappings = mappings.filter((m) => m.targetField === 'predecessors')
    if (predMappings.length > 0) {
      // Build a name→row-index map once (O(n)) instead of findIndex per task (O(n²))
      const nameColSrc = mappings.find((m) => m.targetField === 'name')?.sourceColumn ?? ''
      const nameColIdx = headerIndex.get(nameColSrc)
      const nameToRowIdx = new Map<string, number>()
      if (nameColIdx !== undefined) {
        for (let ri = 0; ri < rows.length; ri++) {
          const row = rows[ri]!
          if (nameColIdx < row.length && row[nameColIdx]!.trim()) {
            nameToRowIdx.set(row[nameColIdx]!.trim(), ri)
          }
        }
      }

      for (const predMapping of predMappings) {
        const colIdx = headerIndex.get(predMapping.sourceColumn)
        if (colIdx === undefined) continue

        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i]!
          const rowIdx = nameToRowIdx.get(task.name)
          if (rowIdx === undefined) continue

          const row = rows[rowIdx]!
          const predValue = colIdx < row.length ? (row[colIdx] ?? '') : ''
          if (!predValue.trim()) continue

          try {
            const parsed = parsePredecessorsField(predValue, allTasks)
            for (const p of parsed) {
              dependencies.push(
                Dependency.create({
                  id: asDependencyId(this.ids.dependencyId()),
                  predecessorId: p.taskId,
                  successorId: task.id,
                  type: p.type,
                  lag: Duration.hours(p.lagHours),
                }),
              )
            }
          } catch (err) {
            errors.push({
              row: rowIdx + 2,
              column: predMapping.sourceColumn,
              message: `Invalid predecessor: ${(err as Error).message ?? String(err)}`,
            })
          }
        }
      }
    }

    // Count unique predecessors referenced that don't exist yet
    // (Already handled by parsePredecessorsField throwing on unknown refs)

    const rowsImported = entities.length
    const rowsSkipped = skippedCount

    return { tasks, resources, dependencies, errors, rowsImported, rowsSkipped }
  }

  private parseTaskRow(
    values: Map<string, string>,
    rowIdx: number,
    dateFormat: DateFormat,
    currency: string,
    errors: CsvImportError[],
    _existingTasks: Task[],
  ): Task | null {
    const name = values.get('name') ?? ''
    if (!name.trim()) {
      errors.push({ row: rowIdx + 2, column: 'name', message: 'Task name is required — row skipped' })
      return null
    }

    const startRaw = values.get('start')
    const start = startRaw ? parseDateWithFormat(startRaw, dateFormat) ?? new Date() : new Date()

    const finishRaw = values.get('finish')
    const finish = finishRaw ? parseDateWithFormat(finishRaw, dateFormat) ?? start : start

    const durationRaw = values.get('duration')
    const duration = parseDurationValue(durationRaw ?? '')

    const percentComplete = parseNumber(values.get('percentComplete') ?? '') ?? 0
    const milestone = parseBoolean(values.get('milestone') ?? '') ?? false
    const outlineLevel = parseNumber(values.get('outlineLevel') ?? '') ?? 0
    const wbs = values.get('wbs') ?? ''
    const notes = values.get('notes') ?? ''
    const priority = parseNumber(values.get('priority') ?? '') ?? 500
    const constraintType = parseConstraintType(values.get('constraintType') ?? '')
    const constraintDateRaw = values.get('constraintDate')
    const constraintDate = constraintDateRaw ? parseDateWithFormat(constraintDateRaw, dateFormat) : null
    const fixedCost = parseNumber(values.get('fixedCost') ?? '') ?? 0

    try {
      return Task.create({
        id: asTaskId(this.ids.taskId()),
        name,
        outlineLevel: Math.max(0, Math.floor(outlineLevel)),
        wbs,
        start,
        finish,
        duration: duration.toHours() > 0 ? duration : Duration.hours(8),
        percentComplete: Math.max(0, Math.min(100, percentComplete)),
        milestone: milestone || (duration.toHours() === 0),
        summary: false,
        critical: false,
        totalSlackHours: null,
        freeSlackHours: null,
        notes,
        priority: Math.max(0, Math.min(1000, priority)),
        constraintType,
        constraintDate,
        fixedCost: Money.of(fixedCost, currency),
        cost: Money.of(fixedCost, currency),
        workHours: duration.toHours(),
        schedulingType: 'fixedUnits',
        effortDriven: true,
        parentId: null,
        baseline: null,
        collapsed: false,
      })
    } catch (err) {
      errors.push({
        row: rowIdx + 2,
        column: null,
        message: `Task "${name}": ${(err as Error).message}`,
      })
      return null
    }
  }

  private parseResourceRow(
    values: Map<string, string>,
    rowIdx: number,
    currency: string,
    errors: CsvImportError[],
  ): Resource | null {
    const name = values.get('name') ?? ''
    if (!name.trim()) {
      errors.push({ row: rowIdx + 2, column: 'name', message: 'Resource name is required — row skipped' })
      return null
    }

    const type = parseResourceType(values.get('type') ?? '')
    const group = values.get('group') ?? ''
    const maxUnits = parseNumber(values.get('maxUnits') ?? '') ?? 1
    const standardRate = parseNumber(values.get('standardRate') ?? '') ?? 0
    const overtimeRate = parseNumber(values.get('overtimeRate') ?? '') ?? 0
    const costPerUse = parseNumber(values.get('costPerUse') ?? '') ?? 0
    const notes = values.get('notes') ?? ''
    const email = values.get('email') ?? ''

    try {
      return Resource.create({
        id: asResourceId(this.ids.resourceId()),
        name,
        type,
        email,
        group,
        maxUnits: Math.max(0, maxUnits),
        standardRate: Money.of(standardRate, currency),
        overtimeRate: Money.of(overtimeRate, currency),
        costPerUse: Money.of(costPerUse, currency),
        calendarId: null,
        notes,
      })
    } catch (err) {
      errors.push({
        row: rowIdx + 2,
        column: null,
        message: `Resource "${name}": ${(err as Error).message}`,
      })
      return null
    }
  }

  // ---- Public utility: detect CSV structure without parsing entities -------

  static detectStructure(content: string | ArrayBuffer): {
    headers: string[]
    rows: string[][]
    delimiter: string
    encoding: string
    suggestedEntityType: CsvEntityType
  } {
    const buffer =
      typeof content === 'string'
        ? new TextEncoder().encode(content).buffer
        : content instanceof ArrayBuffer
          ? content
          : new Uint8Array(content).buffer

    const encoding = detectEncoding(buffer)
    const text = decodeContent(buffer, encoding)
    const { headers, rows, delimiter } = parseCsv(text)

    const headerSet = new Set(headers.map((h) => normalizeFieldLabel(h)))
    const hasTaskFields =
      headerSet.has('start') ||
      headerSet.has('duration') ||
      headerSet.has('wbs') ||
      headerSet.has('percentcomplete') ||
      headerSet.has('outlinelevel')
    const hasResourceFields =
      headerSet.has('maxunits') ||
      headerSet.has('standardrate') ||
      headerSet.has('type')

    const suggestedEntityType: CsvEntityType =
      hasTaskFields && !hasResourceFields
        ? 'task'
        : hasResourceFields && !hasTaskFields
          ? 'resource'
          : 'task'

    return { headers, rows, delimiter, encoding, suggestedEntityType }
  }
}
