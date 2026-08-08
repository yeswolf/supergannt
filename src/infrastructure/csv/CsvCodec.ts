import type { ProjectFileCodec, SerializedProjectFile } from '../../application/ports/ProjectFileCodec'
import { Project } from '../../domain/entities/Project'
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
  // No BOM detected.  Try UTF-8; if the result contains replacement
  // characters (0xFFFD) then the input is probably a legacy 8-bit
  // encoding such as windows-1252 — common for CSVs saved from Excel
  // on Western European locales.
  try {
    const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    if (utf8Text.includes('�')) {
      // Fall back to windows-1252.  TextDecoder may throw in runtimes that
      // don't ship this encoding (e.g. embedded JS engines).
      try {
        new TextDecoder('windows-1252') // Verify the encoding is actually available
        return 'windows-1252'
      } catch {
        return 'utf-8'
      }
    }
    return 'utf-8'
  } catch {
    return 'utf-8'
  }
}

function decodeContent(buffer: ArrayBuffer, encoding: string): string {
  try {
    let text = new TextDecoder(encoding).decode(buffer)
    // Strip UTF-8 BOM if present — it is only a signature, not content.
    // The exporter adds a BOM (for Excel compatibility) so round-trips
    // must strip it on import to avoid corrupting the first header field.
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1)
    }
    return text
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

function detectDelimiter(headerLine: string, dataLine?: string): string {
  const candidates = [',', '\t', ';']
  let best = ','
  let bestCount = 0
  for (const c of candidates) {
    let count = (headerLine.match(new RegExp(escapeRegex(c), 'g')) || []).length
    // Cross-validate against the first data row: if the header-detected
    // delimiter appears zero times in the data row, heavily discount it.
    // This catches the common case of a semicolon-separated header
    // concatenated with comma-separated data rows.
    if (dataLine !== undefined) {
      const dataCount = (dataLine.match(new RegExp(escapeRegex(c), 'g')) || []).length
      if (dataCount === 0 && count > 0) {
        count = 0
      }
    }
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

/** Parse full CSV text into rows. Handles multiline quoted fields. */
function parseCsv(text: string, delimiter?: string): { headers: string[]; rows: string[][]; delimiter: string } {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Detect delimiter from first line if not provided.
  // Cross-validate against the first data row to catch header/data
  // delimiter mismatches (e.g. semicolon header + comma data rows).
  const firstNewline = normalized.indexOf('\n')
  const firstLine = firstNewline >= 0 ? normalized.slice(0, firstNewline) : normalized
  let secondLine: string | undefined
  if (firstNewline >= 0) {
    const secondNewline = normalized.indexOf('\n', firstNewline + 1)
    secondLine = secondNewline >= 0 ? normalized.slice(firstNewline + 1, secondNewline) : normalized.slice(firstNewline + 1)
  }
  const delim = delimiter ?? detectDelimiter(firstLine, secondLine)

  // Parse with multiline quoted field support
  const allFields: string[][] = []
  let currentFields: string[] = []
  let currentField = ''
  let inQuotes = false
  let fieldWasQuoted = false

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
        if (currentField.trim() === '') {
          // Field starts with a quote — it is a quoted field.
          // Leading whitespace before the opening quote is discarded
          // (matching spreadsheet behaviour).
          currentField = ''
          fieldWasQuoted = true
        }
        inQuotes = true
      } else if (ch === delim) {
        currentFields.push(fieldWasQuoted ? currentField : currentField.trim())
        currentField = ''
        fieldWasQuoted = false
      } else if (ch === '\n') {
        currentFields.push(fieldWasQuoted ? currentField : currentField.trim())
        allFields.push(currentFields)
        currentFields = []
        currentField = ''
        fieldWasQuoted = false
      } else {
        currentField += ch
      }
    }
  }
  // Don't forget the last field and row
  currentFields.push(fieldWasQuoted ? currentField : currentField.trim())
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

/**
 * Convert CSV content (string or binary) to a string.  String inputs are
 * returned directly (with BOM stripped if present), avoiding an encode →
 * detect → decode round-trip.  Binary inputs go through full encoding
 * detection and decoding.
 */
function csvContentToString(content: string | ArrayBuffer): string {
  if (typeof content === 'string') {
    let text = content
    // Strip BOM from string content too — the exporter prepends one,
    // and round-trip tests feed string content directly without going
    // through decodeContent().
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1)
    }
    return text
  }
  const buffer =
    content instanceof ArrayBuffer
      ? content
      : new Uint8Array(content).buffer
  const encoding = detectEncoding(buffer)
  return decodeContent(buffer, encoding)
}

// ---- Date parsing ---------------------------------------------------------

/**
 * Parse an ISO-8601 date string. Only called from {@link parseDateWithFormat}
 * when `dateFormat === 'iso'`, so it receives YYYY-MM-DD or similar ISO forms.
 * Uses `new Date(value)` which parses ISO strings consistently across runtimes;
 * slashed dates like "01/05/2026" will NOT reach this function — they are
 * dispatched to {@link parseDateUs} or {@link parseDateEu} instead.
 *
 * A regex pre-filter rejects non-ISO formats (including slashed dates) before
 * they reach `new Date()`, so that a wrong `dateFormat` value cannot silently
 * produce a valid-but-wrong Date from a US/EU-formatted string.
 */
function parseDateIso(value: string): Date | null {
  // Accept YYYY-MM-DD or YYYY/MM/DD only; reject ambiguous M/D/Y or D/M/Y forms.
  const match = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseDateUs(value: string): Date | null {
  // MM/DD/YYYY or M/D/YYYY — accepts dash or slash separator
  const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(value.trim())
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseDateEu(value: string): Date | null {
  // DD/MM/YYYY or D/M/YYYY — accepts dash or slash separator
  const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(value.trim())
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

// ---- Duration helpers -----------------------------------------------------

/** Fallback unit for plain-number duration values.  The exporter always
 *  appends a `d` suffix, and the importer treats a bare number (no suffix)
 *  as days.  Keep these two constants in sync with {@link formatDurationCsv}. */
const FALLBACK_DURATION_UNIT = 'd' as const

/** Parse a duration value from a CSV cell.
 *
 *  Accepts any format {@link Duration.parse} understands plus a plain numeric
 *  fallback (treated as days for backwards compatibility).  Coupled with
 *  {@link formatDurationCsv} via {@link FALLBACK_DURATION_UNIT} — a bare
 *  number without a unit suffix is ambiguous (hours vs days), so the
 *  exporter always appends `d`.  If you change the fallback unit here you
 *  must also update the exporter.
 *
 *  @returns A Duration, or `null` when the value is unparseable.
 *           Callers must check for null before using the result;
 *           {@link parseTaskRow} handles this by falling back to a default.
 */
function parseDurationValue(value: string): Duration | null {
  const trimmed = value.trim()
  if (!trimmed) return Duration.zero()
  // Try Duration.parse first
  try {
    return Duration.parse(trimmed)
  } catch {
    // Fallback: plain number = days
    const n = Number(trimmed.replace(/,/g, ''))
    if (Number.isFinite(n)) {
      return Duration.of(n, FALLBACK_DURATION_UNIT)
    }
    return null
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
  'summary',
  'notes',
  'priority',
  'constraintType',
  'constraintDate',
  'fixedCost',
  'predecessors',
] as const

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

function normalizeFieldLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '')
}

// ---- Export helpers -------------------------------------------------------

const BOM = '﻿'

/** Escape a CSV field for RFC 4180 compliance.
 *  @param delimiter  The field delimiter used by the writer (default `,`).
 *                    When the delimiter is not a comma the value is still quoted
 *                    if it contains commas — other consumers expect CSV-compatible
 *                    quoting regardless of the output delimiter. */
function csvEscape(value: string, delimiter: string = ','): string {
  if (value.includes(delimiter) || value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
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

/** Format a Duration for CSV export.
 *
 *  Writes a day count with an explicit `d` suffix so the round-trip through
 *  {@link parseDurationValue} is lossless: without the suffix a bare number
 *  like `"5"` would be reinterpreted as *hours* by `Duration.parse`, not as
 *  5 days.  The two functions are coupled on this suffix convention — if you
 *  change one, change the other. */
function formatDurationCsv(duration: Duration): string {
  const days = duration.toDays()
  if (days === 0) return '0'
  // Suffix 'd' so parseDurationValue reinterprets it as days, not hours.
  return days.toFixed(2) + FALLBACK_DURATION_UNIT
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

// ---- Entity type detection -------------------------------------------------

function detectEntityType(headers: string[]): CsvEntityType | null {
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

  if (hasTaskFields && !hasResourceFields) return 'task'
  if (hasResourceFields && !hasTaskFields) return 'resource'
  // Both or neither matched — ambiguous headers.  Return null so the
  // caller can decide (e.g. via explicit user choice) instead of silently
  // defaulting to 'task'.
  return null
}

// ---- The Codec ------------------------------------------------------------

export class CsvCodec implements ProjectFileCodec {
  readonly supportedExtensions = ['.csv'] as const
  private readonly entityType: CsvEntityType
  private readonly dateFormat: DateFormat

  constructor(
    private readonly ids: IdGenerator,
    entityType: CsvEntityType = 'task',
    dateFormat: DateFormat = 'iso',
  ) {
    this.entityType = entityType
    this.dateFormat = dateFormat
  }

  canHandle(fileName: string): boolean {
    return fileName.toLowerCase().endsWith('.csv')
  }

  handlesExportFormat(format: string): boolean {
    const EXPORT_FORMAT_MAP: Record<CsvEntityType, string> = {
      task: 'csv-tasks',
      resource: 'csv-resources',
    }
    return format === EXPORT_FORMAT_MAP[this.entityType]
  }

  /** Content-aware import disambiguation.  Inspects column headers to
   *  determine whether this codec instance (task or resource) should
   *  handle the file.  Called by {@link FileUseCases.codecFor} when
   *  multiple codecs claim the same extension. */
  canHandleImport(content: string | ArrayBuffer, _fileName: string): boolean {
    const text = csvContentToString(content)
    const { headers } = parseCsv(text)
    const detectedType = detectEntityType(headers)
    return detectedType !== null && detectedType === this.entityType
  }

  /**
   * Parse CSV content into a Project containing imported tasks or resources.
   * For import into an existing project, use {@link importFromCsv} instead.
   */
  async parse(content: string | ArrayBuffer, fileName: string): Promise<Project> {
    const text = csvContentToString(content)

    const { headers, rows } = parseCsv(text)

    if (headers.length === 0) {
      throw new Error('CSV file is empty or has no header row')
    }

    // Auto-detect entity type from column headers.  When the sniffer can't
    // confidently distinguish (e.g. headers without any task- or resource-
    // specific fields), fall back to the constructor's explicit entityType.
    const detectedType = detectEntityType(headers)
    const effectiveType = detectedType ?? this.entityType

    // Build default column mappings from headers
    const mappings = this.buildDefaultMappings(headers, effectiveType)

    const result = this.parseRows(rows, headers, mappings, this.dateFormat, effectiveType)

    // Use epoch for project-level date defaults so repeat imports are
    // stable, matching parseTaskRow's date-defaulting behaviour.
    const epoch = new Date(0)
    const calendarId = asCalendarId(this.ids.calendarId())
    const calendar = WorkCalendar.standard(calendarId)

    const project = Project.create({
      id: asProjectId(this.ids.projectId()),
      name: 'Imported CSV',
      title: 'Imported CSV',
      manager: '',
      startDate: result.tasks.length > 0 ? result.tasks[0]!.start : epoch,
      finishDate: result.tasks.length > 0 ? result.tasks[result.tasks.length - 1]!.finish : epoch,
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

    // Pre-build lookup Maps to avoid O(n²) scans inside the task loop.
    const taskIndex = new Map<string, number>()
    project.tasks.forEach((t, i) => taskIndex.set(t.id, i))

    const taskResourceNames = new Map<string, string>()
    for (const a of project.assignments) {
      const r = project.resources.find((res) => res.id === a.resourceId)
      const name = r?.name ?? ''
      if (!name) continue
      const prev = taskResourceNames.get(a.taskId)
      taskResourceNames.set(a.taskId, prev ? `${prev}; ${name}` : name)
    }

    const lines: string[] = [headers.join(',')]

    for (const task of project.tasks) {
      const predecessors = formatPredecessors(project, task.id, taskIndex)
      const resourceNames = taskResourceNames.get(task.id) ?? ''

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
    existingTasks?: Task[],
  ): CsvImportResult {
    const resolvedExistingTasks = existingTasks ?? []
    const text = csvContentToString(content)
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
      resolvedExistingTasks,
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
    existingTasks?: Task[],
  ): CsvImportResult {
    const resolvedExistingTasks = existingTasks ?? []
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
          const task = this.parseTaskRow(values, rowIdx, dateFormat, currency, errors)
          if (task) {
            entities.push(task)
          } else {
            skippedCount++
          }
        } catch (err) {
          errors.push({ row: rowIdx + 2, column: null, message: `Failed to parse task row: ${(err as Error).message ?? String(err)}` })
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
        } catch (err) {
          errors.push({ row: rowIdx + 2, column: null, message: `Failed to parse resource row: ${(err as Error).message ?? String(err)}` })
          skippedCount++
        }
      }
    }

    const tasks = entities.filter((e): e is Task => e instanceof Task)
    const resources = entities.filter((e): e is Resource => e instanceof Resource)

    // Resolve predecessors from the predecessor column
    const allTasks = [...resolvedExistingTasks, ...tasks]
    // Build a WBS→Task map once to avoid O(n²) scans in parsePredecessorToken.
    const wbsMap = new Map<string, Task>()
    for (const t of allTasks) {
      if (t.wbs) wbsMap.set(t.wbs, t)
    }
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
            const trimmedName = row[nameColIdx]!.trim()
            if (nameToRowIdx.has(trimmedName)) {
              errors.push({
                row: ri + 2,
                column: nameColSrc,
                message: `Duplicate task name "${trimmedName}" — predecessor references to this name will resolve to the first occurrence`,
              })
            } else {
              nameToRowIdx.set(trimmedName, ri)
            }
          }
        }
      }

      for (const predMapping of predMappings) {
        const colIdx = headerIndex.get(predMapping.sourceColumn)
        if (colIdx === undefined) continue

        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i]!
          const rowIdx = nameToRowIdx.get(task.name.trim())
          if (rowIdx === undefined) continue

          const row = rows[rowIdx]!
          const predValue = colIdx < row.length ? (row[colIdx] ?? '') : ''
          if (!predValue.trim()) continue

          try {
            const parsed = parsePredecessorsField(predValue, tasks, wbsMap)
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
  ): Task | null {
    const name = values.get('name') ?? ''
    if (!name.trim()) {
      errors.push({ row: rowIdx + 2, column: 'name', message: 'Task name is required — row skipped' })
      return null
    }

    const startRaw = values.get('start')
    // Default missing dates to epoch (stable across imports) rather than
    // wall-clock time, so that repeat imports produce the same data.
    const start = startRaw ? parseDateWithFormat(startRaw, dateFormat) ?? new Date(0) : new Date(0)

    const finishRaw = values.get('finish')
    const finish = finishRaw ? parseDateWithFormat(finishRaw, dateFormat) ?? start : start

    const durationRaw = values.get('duration')
    const duration = parseDurationValue(durationRaw ?? '')
    if (duration === null) {
      errors.push({ row: rowIdx + 2, column: 'duration', message: `Duration value "${durationRaw}" is not parseable — using default 1 day` })
    }

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

    const summary = parseBoolean(values.get('summary') ?? '') ?? false

    try {
      return Task.create({
        id: asTaskId(this.ids.taskId()),
        name,
        outlineLevel: Math.max(0, Math.floor(outlineLevel)),
        wbs,
        start,
        finish,
        duration: (duration !== null && duration.toHours() > 0) ? duration : Duration.hours(8),
        percentComplete: Math.max(0, Math.min(100, percentComplete)),
        milestone: milestone || (duration !== null && duration.toHours() === 0),
        summary,
        critical: false,
        totalSlackHours: null,
        freeSlackHours: null,
        notes,
        priority: Math.max(0, Math.min(1000, priority)),
        constraintType,
        constraintDate,
        fixedCost: Money.of(fixedCost, currency),
        cost: Money.of(fixedCost, currency),
        workHours: duration !== null ? duration.toHours() : 0,
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
    // NOTE: 'calendar' is exported as a name but we don't resolve it back to
    // an ID on import because calendar name→ID lookup requires project context
    // that isn't available during row parsing. The field is left at null.

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
    suggestedEntityType: CsvEntityType | null
  } {
    let encoding: string
    let text: string
    if (typeof content === 'string') {
      text = content
      // Strip BOM from string content — the exporter prepends one.
      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1)
      }
      encoding = 'utf-8'
    } else {
      const buffer =
        content instanceof ArrayBuffer
          ? content
          : new Uint8Array(content).buffer
      encoding = detectEncoding(buffer)
      text = decodeContent(buffer, encoding)
    }
    const { headers, rows, delimiter } = parseCsv(text)

    const suggestedEntityType = detectEntityType(headers)

    return { headers, rows, delimiter, encoding, suggestedEntityType }
  }
}
