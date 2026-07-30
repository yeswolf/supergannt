import type { ProjectFileCodec } from '../../application/ports/ProjectFileCodec'
import type { Project } from '../../domain/entities/Project'

/**
 * Microsoft Project Exchange (MPX) writer — same format ProjectLibre/MPXJ
 * expose via MPXWriter (see ProjectLibre ProjectWriterUtility: "MPX" → MPXWriter).
 * Binary .mpp is NOT in ProjectLibre's writer map.
 */
export class MpxCodec implements ProjectFileCodec {
  readonly supportedExtensions = ['.mpx'] as const

  canHandle(fileName: string): boolean {
    return fileName.toLowerCase().endsWith('.mpx')
  }

  async parse(_content: string | ArrayBuffer, _fileName: string): Promise<Project> {
    throw new Error('MPX import is not implemented; open .mpp or MSPDI .xml instead')
  }

  async serialize(
    project: Project,
  ): Promise<{ content: string; mimeType: string; extension: string }> {
    const lines: string[] = []
    // MPX 4.0 International header (ProjectLibre / MPXJ default locale)
    lines.push('MPX,ANSI,English,4.0')
    lines.push(`10,${escape(project.name)};${escape(project.title)};${escape(project.manager)}`)
    lines.push(
      `11,${formatMpxDate(project.startDate)};${formatMpxDate(project.finishDate)}`,
    )
    lines.push('30,USD,$')
    lines.push('40,2,2,2') // date/time formats
    lines.push('50,1,1,1,1,1,0,0') // Mon–Fri working (matches Standard calendar)

    // Calendars
    lines.push('20,1,Standard')
    for (const day of project.getCalendar().workDays) {
      // 21 = hours per day of week; MPX day 1=Sun
      const hours = day.working ? Math.max(0, day.endHour - day.startHour) : 0
      lines.push(`21,${day.dayOfWeek + 1},${hours}`)
    }

    // Resources (UID 0 reserved)
    lines.push('40') // resource table marker style rows via 50s historically; use 40/50 pattern carefully
    project.resources.forEach((resource, index) => {
      const id = index + 1
      lines.push(
        `50,${id};${escape(resource.name)};${resource.maxUnits};${resource.standardRate.amount};${resource.group}`,
      )
    })

    // Tasks — outline-aware list (ProjectLibre order)
    project.tasks.forEach((task, index) => {
      const id = index + 1
      const preds = project.dependencies
        .filter((d) => d.successorId === task.id)
        .map((d) => {
          const predIndex = project.tasks.findIndex((t) => t.id === d.predecessorId)
          if (predIndex < 0) return null
          const lag = d.lag.toHours()
          const lagPart = lag === 0 ? '' : lag > 0 ? `+${lag}h` : `${lag}h`
          return `${predIndex + 1}${d.type}${lagPart}`
        })
        .filter(Boolean)
        .join(',')

      const duration = task.milestone
        ? '0h'
        : `${task.duration.toHours()}h`
      lines.push(
        [
          '70',
          id,
          escape(task.name),
          task.outlineLevel + 1,
          duration,
          formatMpxDate(task.start),
          formatMpxDate(task.finish),
          task.percentComplete,
          task.priority,
          preds,
          task.milestone ? '1' : '0',
          task.summary ? '1' : '0',
        ].join(';'),
      )
    })

    // Assignments
    project.assignments.forEach((assignment) => {
      const taskIndex = project.tasks.findIndex((t) => t.id === assignment.taskId)
      const resourceIndex = project.resources.findIndex((r) => r.id === assignment.resourceId)
      if (taskIndex < 0 || resourceIndex < 0) return
      const task = project.tasks[taskIndex]!
      const hours =
        assignment.workHours > 0
          ? assignment.workHours
          : task.duration.toHours() * assignment.units
      lines.push(
        `75,${taskIndex + 1};${resourceIndex + 1};${assignment.units};${hours}h`,
      )
    })

    return {
      content: `${lines.join('\r\n')}\r\n`,
      mimeType: 'text/plain',
      extension: '.mpx',
    }
  }
}

function escape(value: string): string {
  return value.replace(/;/g, ',').replace(/\r?\n/g, ' ')
}

function formatMpxDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${d}/${m}/${y} ${hh}:${mm}`
}

/** Explicit policy shared with ProjectLibre / MPXJ. */
export function projectLibreCanWriteMpp(): false {
  return false
}

export function projectLibreWriteFormats(): readonly string[] {
  // From ProjectLibre-bundled ProjectWriterUtility.WRITER_MAP
  return ['MPX', 'XML', 'PLANNER', 'JSON'] as const
}

export function explainMppWriteUnsupported(): string {
  return (
    'ProjectLibre cannot write binary .mpp either. It embeds MPXJ, whose ProjectWriterUtility ' +
    'only registers MPX, XML (MSPDI), PLANNER, and JSON — not MPP. ' +
    'MPXJ FAQ: “Can I use MPXJ to write MPP files? Not at present.” ' +
    'Save as Microsoft Project XML (.xml / MSPDI) — the same interchange format ProjectLibre uses.'
  )
}
