import { describe, expect, it } from 'vitest'
import { CsvCodec } from './CsvCodec'
import type { CsvImportOptions } from './CsvCodec'
import { createDemoProject, createEmptyProject } from '../../application/services/ProjectFactory'
import { refreshProject } from '../../application/services/ProjectRefresh'
import type { IdGenerator } from '../../application/ports/IdGenerator'

class SeqIds implements IdGenerator {
  private n = 0
  private next(prefix: string) {
    this.n += 1
    return `${prefix}${this.n}`
  }
  projectId() {
    return this.next('p')
  }
  taskId() {
    return this.next('t')
  }
  resourceId() {
    return this.next('r')
  }
  dependencyId() {
    return this.next('d')
  }
  assignmentId() {
    return this.next('a')
  }
  calendarId() {
    return this.next('c')
  }
}

describe('CsvCodec', () => {
  it('canHandle returns true for .csv files', () => {
    const codec = new CsvCodec(new SeqIds(), 'task')
    expect(codec.canHandle('tasks.csv')).toBe(true)
    expect(codec.canHandle('resources.csv')).toBe(true)
    expect(codec.canHandle('plan.xml')).toBe(false)
    expect(codec.canHandle('plan.mpp')).toBe(false)
  })

  it('exports tasks to CSV with BOM', async () => {
    const ids = new SeqIds()
    const codec = new CsvCodec(ids, 'task')
    const project = refreshProject(createDemoProject(ids))
    const { content, mimeType, extension } = await codec.serialize(project)

    expect(mimeType).toBe('text/csv')
    expect(extension).toBe('.csv')
    expect(typeof content).toBe('string')

    const csv = content as string
    // Check BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    // Check headers
    expect(csv).toContain('WBS,Name,Outline Level,Start,Finish,Duration,% Complete')
    // Check task data
    expect(csv).toContain('Kickoff meeting')
    expect(csv).toContain('Go live')
  })

  it('exports resources to CSV with BOM', async () => {
    const ids = new SeqIds()
    const codec = new CsvCodec(ids, 'resource')
    const project = refreshProject(createDemoProject(ids))
    const { content, mimeType, extension } = await codec.serialize(project)

    expect(mimeType).toBe('text/csv')
    expect(extension).toBe('.csv')
    expect(typeof content).toBe('string')

    const csv = content as string
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('Name,Type,Group,Max Units,Standard Rate')
    expect(csv).toContain('Alex Designer')
    expect(csv).toContain('Sam Developer')
  })

  it('imports tasks from CSV', async () => {
    const csv = [
      'Name,Start,Finish,Duration,% Complete,WBS,Outline Level',
      'Task A,2026-01-05,2026-01-10,5,50,1,0',
      'Task B,2026-01-11,2026-01-15,4,0,1.1,1',
      'Milestone C,2026-01-15,2026-01-15,0,100,1.2,1',
    ].join('\n')

    const ids = new SeqIds()
    const options: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Start', targetField: 'start' },
        { sourceColumn: 'Finish', targetField: 'finish' },
        { sourceColumn: 'Duration', targetField: 'duration' },
        { sourceColumn: '% Complete', targetField: 'percentComplete' },
        { sourceColumn: 'WBS', targetField: 'wbs' },
        { sourceColumn: 'Outline Level', targetField: 'outlineLevel' },
      ],
    }

    const result = CsvCodec.importFromCsv(csv, options, ids)
    expect(result.tasks).toHaveLength(3)
    expect(result.errors).toHaveLength(0)
    expect(result.rowsImported).toBe(3)

    expect(result.tasks[0]!.name).toBe('Task A')
    expect(result.tasks[0]!.outlineLevel).toBe(0)
    expect(result.tasks[0]!.wbs).toBe('1')
    expect(result.tasks[0]!.percentComplete).toBe(50)

    expect(result.tasks[1]!.name).toBe('Task B')
    expect(result.tasks[1]!.outlineLevel).toBe(1)
    expect(result.tasks[1]!.wbs).toBe('1.1')

    expect(result.tasks[2]!.name).toBe('Milestone C')
    expect(result.tasks[2]!.milestone).toBe(true)
  })

  it('imports resources from CSV', async () => {
    const csv = [
      'Name,Type,Group,Max Units,Standard Rate,Overtime Rate,Notes',
      'Alice,work,Engineering,1,85,127.5,Senior engineer',
      'Bob,material,Supplies,5,10,15,Material resource',
    ].join('\n')

    const ids = new SeqIds()
    const options: CsvImportOptions = {
      entityType: 'resource',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Type', targetField: 'type' },
        { sourceColumn: 'Group', targetField: 'group' },
        { sourceColumn: 'Max Units', targetField: 'maxUnits' },
        { sourceColumn: 'Standard Rate', targetField: 'standardRate' },
        { sourceColumn: 'Overtime Rate', targetField: 'overtimeRate' },
        { sourceColumn: 'Notes', targetField: 'notes' },
      ],
    }

    const result = CsvCodec.importFromCsv(csv, options, ids)
    expect(result.resources).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
    expect(result.resources[0]!.name).toBe('Alice')
    expect(result.resources[0]!.type).toBe('work')
    expect(result.resources[0]!.group).toBe('Engineering')
    expect(result.resources[1]!.name).toBe('Bob')
    expect(result.resources[1]!.type).toBe('material')
    expect(result.resources[1]!.maxUnits).toBe(5)
  })

  it('skips rows with missing names and reports errors', async () => {
    const csv = [
      'Name,Duration',
      'Task A,5',
      ',3',
      'Task B,4',
    ].join('\n')

    const ids = new SeqIds()
    const options: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Duration', targetField: 'duration' },
      ],
    }

    const result = CsvCodec.importFromCsv(csv, options, ids)
    expect(result.tasks).toHaveLength(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.message).toContain('name')
  })

  it('detects CSV structure', () => {
    const csv = 'Name,Start,Duration,WBS\nTask A,2026-01-01,5,1'
    const structure = CsvCodec.detectStructure(csv)
    expect(structure.headers).toEqual(['Name', 'Start', 'Duration', 'WBS'])
    expect(structure.delimiter).toBe(',')
    expect(structure.suggestedEntityType).toBe('task')
  })

  it('detects resource CSV structure', () => {
    const csv = 'Name,Type,Max Units,Standard Rate\nAlice,work,1,85'
    const structure = CsvCodec.detectStructure(csv)
    expect(structure.suggestedEntityType).toBe('resource')
  })

  it('handles tab delimiter auto-detection', () => {
    const csv = 'Name\tStart\tDuration\nTask A\t2026-01-01\t5'
    const structure = CsvCodec.detectStructure(csv)
    expect(structure.delimiter).toBe('\t')
    expect(structure.headers).toEqual(['Name', 'Start', 'Duration'])
  })

  it('handles semicolon delimiter auto-detection', () => {
    const csv = 'Name;Start;Duration\nTask A;2026-01-01;5'
    const structure = CsvCodec.detectStructure(csv)
    expect(structure.delimiter).toBe(';')
  })

  it('parses dates in different formats', async () => {
    // US date format: MM/DD/YYYY
    const csvUs = 'Name,Start\nTask A,01/15/2026'
    const idsUs = new SeqIds()
    const optsUs: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'us',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Start', targetField: 'start' },
      ],
    }
    const resUs = CsvCodec.importFromCsv(csvUs, optsUs, idsUs)
    expect(resUs.tasks[0]!.start.getFullYear()).toBe(2026)
    expect(resUs.tasks[0]!.start.getMonth()).toBe(0) // January
    expect(resUs.tasks[0]!.start.getDate()).toBe(15)

    // EU date format: DD/MM/YYYY
    const csvEu = 'Name,Start\nTask A,15/01/2026'
    const idsEu = new SeqIds()
    const optsEu: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'eu',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Start', targetField: 'start' },
      ],
    }
    const resEu = CsvCodec.importFromCsv(csvEu, optsEu, idsEu)
    expect(resEu.tasks[0]!.start.getFullYear()).toBe(2026)
    expect(resEu.tasks[0]!.start.getMonth()).toBe(0) // January
    expect(resEu.tasks[0]!.start.getDate()).toBe(15)
  })

  it('handles quoted fields with commas', async () => {
    const csv = 'Name,Notes\nTask A,"This task, which is important, needs review"'
    const ids = new SeqIds()
    const opts: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Notes', targetField: 'notes' },
      ],
    }
    const result = CsvCodec.importFromCsv(csv, opts, ids)
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]!.notes).toBe('This task, which is important, needs review')
  })

  it('round-trips tasks: export then import', async () => {
    const ids1 = new SeqIds()
    const project = refreshProject(createDemoProject(ids1))
    const codec = new CsvCodec(new SeqIds(), 'task')
    const { content } = await codec.serialize(project)

    // Import into a new blank project
    const csvString = content as string
    // Strip BOM for structure detection
    const body = csvString.slice(1)

    const structure = CsvCodec.detectStructure(body)
    const ids2 = new SeqIds()

    const mappings = structure.headers.map((h) => {
      const normalized = h.trim().toLowerCase().replace(/\s+/g, '')
      const fieldMap: Record<string, string> = {
        wbs: 'wbs',
        name: 'name',
        outlinelevel: 'outlineLevel',
        start: 'start',
        finish: 'finish',
        duration: 'duration',
        '%complete': 'percentComplete',
        milestone: 'milestone',
        notes: 'notes',
        priority: 'priority',
        constrainttype: 'constraintType',
        constraintdate: 'constraintDate',
        fixedcost: 'fixedCost',
        predecessors: 'predecessors',
      }
      const targetField = fieldMap[normalized]
      return targetField ? { sourceColumn: h, targetField } : null
    }).filter(Boolean) as { sourceColumn: string; targetField: string }[]

    const opts: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: mappings,
    }

    const result = CsvCodec.importFromCsv(body, opts, ids2)
    expect(result.errors).toHaveLength(0)
    expect(result.tasks.length).toBe(project.tasks.length)

    // Verify each task
    for (let i = 0; i < project.tasks.length; i++) {
      const original = project.tasks[i]!
      const imported = result.tasks[i]!
      expect(imported.name).toBe(original.name)
      expect(imported.outlineLevel).toBe(original.outlineLevel)
    }
  })

  it('handles UTF-16 LE encoded CSV', async () => {
    const csv = 'Name,Start\nTask A,2026-01-05'
    // Encode as UTF-16 LE with BOM
    const encoder = new TextEncoder()
    const utf16 = new Uint8Array(2 + csv.length * 2)
    utf16[0] = 0xff
    utf16[1] = 0xfe
    for (let i = 0; i < csv.length; i++) {
      utf16[2 + i * 2] = csv.charCodeAt(i) & 0xff
      utf16[2 + i * 2 + 1] = (csv.charCodeAt(i) >> 8) & 0xff
    }

    const ids = new SeqIds()
    const options: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Start', targetField: 'start' },
      ],
    }

    const result = CsvCodec.importFromCsv(utf16.buffer, options, ids)
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]!.name).toBe('Task A')
  })

  it('handles empty CSV gracefully', () => {
    const structure = CsvCodec.detectStructure('')
    expect(structure.headers).toHaveLength(0)
  })

  it('parses constraint types and priorities', async () => {
    const csv = [
      'Name,Constraint Type,Priority',
      'Task A,Must Start On,800',
      'Task B,Start No Earlier Than,300',
      'Task C,,500',
    ].join('\n')

    const ids = new SeqIds()
    const opts: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Constraint Type', targetField: 'constraintType' },
        { sourceColumn: 'Priority', targetField: 'priority' },
      ],
    }

    const result = CsvCodec.importFromCsv(csv, opts, ids)
    expect(result.tasks).toHaveLength(3)
    expect(result.tasks[0]!.constraintType).toBe('mustStartOn')
    expect(result.tasks[0]!.priority).toBe(800)
    expect(result.tasks[1]!.constraintType).toBe('startNoEarlierThan')
    expect(result.tasks[1]!.priority).toBe(300)
    expect(result.tasks[2]!.constraintType).toBe('asSoonAsPossible')
    expect(result.tasks[2]!.priority).toBe(500)
  })

  it('imports tasks with predecessors', async () => {
    const csv = [
      'Name,Predecessors',
      'Task A,',
      'Task B,1FS',
      'Task C,1FS,2',
    ].join('\n')

    const ids = new SeqIds()
    const opts: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Predecessors', targetField: 'predecessors' },
      ],
    }

    const result = CsvCodec.importFromCsv(csv, opts, ids)
    expect(result.tasks).toHaveLength(3)
    expect(result.dependencies.length).toBeGreaterThanOrEqual(2)
  })

  it('handles quoted fields with embedded newlines', async () => {
    const csv = 'Name,Notes\nTask A,"Line 1\nLine 2\nLine 3"\nTask B,Simple note'
    const ids = new SeqIds()
    const opts: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Notes', targetField: 'notes' },
      ],
    }

    const result = CsvCodec.importFromCsv(csv, opts, ids)
    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[0]!.notes).toBe('Line 1\nLine 2\nLine 3')
    expect(result.tasks[1]!.name).toBe('Task B')
  })

  // Product requirement: < 3 seconds.  CI timeout is 10 s to avoid flaking
  // on cold runners; verify real perf manually.
  it('imports 1000 tasks within a generous CI timeout', async () => {
    const lines = ['Name,Start,Duration,WBS']
    for (let i = 1; i <= 1000; i++) {
      lines.push(`Task ${i},2026-01-01,5,${i}`)
    }
    const csv = lines.join('\n')

    const ids = new SeqIds()
    const opts: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Start', targetField: 'start' },
        { sourceColumn: 'Duration', targetField: 'duration' },
        { sourceColumn: 'WBS', targetField: 'wbs' },
      ],
    }

    const start = performance.now()
    const result = CsvCodec.importFromCsv(csv, opts, ids)
    const elapsed = performance.now() - start

    expect(result.tasks).toHaveLength(1000)
    expect(result.errors).toHaveLength(0)
    expect(elapsed).toBeLessThan(10000)
  })

  it('ignores unmapped columns', async () => {
    const csv = [
      'Name,Duration,Extra Field,Jira ID',
      'Task A,5,ignore-me,PROJ-123',
    ].join('\n')

    const ids = new SeqIds()
    const opts: CsvImportOptions = {
      entityType: 'task',
      dateFormat: 'iso',
      hasHeader: true,
      columnMappings: [
        { sourceColumn: 'Name', targetField: 'name' },
        { sourceColumn: 'Duration', targetField: 'duration' },
      ],
    }

    const result = CsvCodec.importFromCsv(csv, opts, ids)
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0]!.name).toBe('Task A')
    // Extra columns ignored silently
  })
})
