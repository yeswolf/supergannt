import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import type { ProjectFileCodec } from '../../application/ports/ProjectFileCodec'
import { Project } from '../../domain/entities/Project'
import { Task } from '../../domain/entities/Task'
import { Resource } from '../../domain/entities/Resource'
import { Dependency } from '../../domain/entities/Dependency'
import { Assignment } from '../../domain/entities/Assignment'
import { WorkCalendar } from '../../domain/entities/WorkCalendar'
import { Duration } from '../../domain/value-objects/Duration'
import { Money } from '../../domain/value-objects/Money'
import {
  asAssignmentId,
  asCalendarId,
  asDependencyId,
  asProjectId,
  asResourceId,
  asTaskId,
} from '../../domain/value-objects/Ids'
import type { LinkType } from '../../domain/entities/Dependency'
import type { ResourceType } from '../../domain/entities/Resource'
import type { IdGenerator } from '../../application/ports/IdGenerator'
import type { TaskSchedulingType } from '../../domain/services/EffortScheduling'

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '')
}

/** Parse MS Project duration like PT16H0M0S or PT5D0H0M0S into days. */
export function parseMspdiDuration(value: unknown): Duration {
  if (value == null || value === '') return Duration.zero()
  const raw = String(value)
  const match = /^PT(?:(\d+)D)?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(raw)
  if (!match) {
    const days = Number(raw)
    return Number.isFinite(days) ? Duration.of(days, 'd') : Duration.zero()
  }
  const days = Number(match[1] ?? 0)
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  const totalDays = days + hours / 8 + minutes / (60 * 8)
  return Duration.of(Number(totalDays.toFixed(4)), 'd')
}

export function formatMspdiDuration(duration: Duration): string {
  const days = duration.toDays()
  const wholeDays = Math.floor(days)
  const hours = Math.round((days - wholeDays) * 8)
  return `PT${wholeDays}D${hours}H0M0S`
}

const LINK_TYPE_MAP: Record<number, LinkType> = {
  0: 'FF',
  1: 'FS',
  2: 'SF',
  3: 'SS',
}

const LINK_TYPE_TO_MSPDI: Record<LinkType, number> = {
  FF: 0,
  FS: 1,
  SF: 2,
  SS: 3,
}

const RESOURCE_TYPE_MAP: Record<number, ResourceType> = {
  0: 'material',
  1: 'work',
  2: 'cost',
}

/** MSPDI Task/Type: 0 Fixed Units, 1 Fixed Duration, 2 Fixed Work */
const SCHEDULING_TYPE_MAP: Record<number, TaskSchedulingType> = {
  0: 'fixedUnits',
  1: 'fixedDuration',
  2: 'fixedWork',
}

const SCHEDULING_TYPE_TO_MSPDI: Record<TaskSchedulingType, number> = {
  fixedUnits: 0,
  fixedDuration: 1,
  fixedWork: 2,
}

function parseMspdiWorkDays(rawCalendar: {
  WeekDays?: { WeekDay?: unknown }
}) {
  const weekDays = asArray(rawCalendar.WeekDays?.WeekDay)
  const byType = new Map<number, { working: boolean; startHour: number; endHour: number }>()
  for (const wd of weekDays as Array<Record<string, unknown>>) {
    const dayType = Number(wd.DayType ?? 0)
    if (dayType < 1 || dayType > 7) continue
    const working = String(wd.DayWorking) === '1' || wd.DayWorking === true
    const times = asArray(
      (wd.WorkingTimes as { WorkingTime?: unknown } | undefined)?.WorkingTime,
    ) as Array<Record<string, unknown>>
    let startHour = 8
    let endHour = 16
    if (times.length > 0) {
      const from = String(times[0]?.FromTime ?? '08:00:00')
      const to = String(times[times.length - 1]?.ToTime ?? '16:00:00')
      startHour = Number(from.split(':')[0] ?? 8)
      endHour = Number(to.split(':')[0] ?? 16)
    }
    byType.set(dayType, { working, startHour, endHour })
  }
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const mapped = byType.get(dayOfWeek + 1)
    if (mapped) {
      return {
        dayOfWeek,
        working: mapped.working,
        startHour: mapped.startHour,
        endHour: mapped.endHour,
      }
    }
    const working = dayOfWeek >= 1 && dayOfWeek <= 5
    return { dayOfWeek, working, startHour: 8, endHour: 16 }
  })
}

export class MspdiCodec implements ProjectFileCodec {
  readonly supportedExtensions = ['.xml', '.mspdi'] as const

  constructor(private readonly ids: IdGenerator) {}

  canHandle(fileName: string): boolean {
    const lower = fileName.toLowerCase()
    return this.supportedExtensions.some((ext) => lower.endsWith(ext))
  }

  async parse(content: string | ArrayBuffer, fileName: string): Promise<Project> {
    const xml =
      typeof content === 'string' ? content : new TextDecoder().decode(content)
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) =>
        ['Task', 'Resource', 'Assignment', 'PredecessorLink', 'WeekDay', 'Calendar', 'WorkingTime'].includes(
          name,
        ),
    })
    const doc = parser.parse(xml)
    const root = doc.Project
    if (!root) {
      throw new Error('Invalid MSPDI file: missing Project root')
    }

    const currency = String(root.CurrencySymbol ? 'USD' : root.CurrencyCode || 'USD')

    const calendarUidToId = new Map<number, string>()
    const rawCalendars = asArray(root.Calendars?.Calendar)
    let calendars = rawCalendars
      .filter((c) => Number(c.UID) > 0)
      .map((c) => {
        const id = asCalendarId(this.ids.calendarId())
        calendarUidToId.set(Number(c.UID), id)
        return WorkCalendar.create({
          id,
          name: String(c.Name ?? 'Calendar'),
          isBase: String(c.IsBaseCalendar) === '1' || c.IsBaseCalendar === true,
          workDays: parseMspdiWorkDays(c),
          exceptions: [],
        })
      })
    if (calendars.length === 0) {
      const calendarId = asCalendarId(this.ids.calendarId())
      calendars = [WorkCalendar.standard(calendarId)]
      calendarUidToId.set(1, calendarId)
    }
    const projectCalendarUid = Number(root.CalendarUID ?? 1) || 1
    const calendarId = asCalendarId(
      calendarUidToId.get(projectCalendarUid) ??
        calendarUidToId.values().next().value ??
        calendars[0]!.id,
    )

    const taskUidToId = new Map<number, string>()
    const rawTasks = asArray(root.Tasks?.Task)
    const tasks = rawTasks
      .filter((t) => Number(t.UID) !== 0)
      .map((t) => {
        const id = asTaskId(this.ids.taskId())
        taskUidToId.set(Number(t.UID), id)
        const start = parseDate(t.Start) ?? new Date()
        const finish = parseDate(t.Finish) ?? start
        const milestone = String(t.Milestone) === '1' || t.Milestone === true
        const outlineLevel = Number(t.OutlineLevel ?? 1) - 1
        return Task.create({
          id,
          name: String(t.Name ?? 'Task'),
          outlineLevel: Math.max(0, outlineLevel),
          wbs: String(t.WBS ?? ''),
          start,
          finish,
          duration: parseMspdiDuration(t.Duration),
          percentComplete: Number(t.PercentComplete ?? 0),
          milestone,
          summary: String(t.Summary) === '1' || t.Summary === true,
          critical: String(t.Critical) === '1' || t.Critical === true,
          notes: String(t.Notes ?? ''),
          priority: Number(t.Priority ?? 500),
          constraintType: 'asSoonAsPossible',
          constraintDate: null,
          fixedCost: Money.of(Number(t.FixedCost ?? 0), currency),
          cost: Money.of(Number(t.Cost ?? 0), currency),
          workHours: parseMspdiDuration(t.Work).toHours(),
          schedulingType: SCHEDULING_TYPE_MAP[Number(t.Type ?? 0)] ?? 'fixedUnits',
          effortDriven:
            t.EffortDriven === undefined
              ? Number(t.Type ?? 0) !== 1
              : String(t.EffortDriven) === '1' || t.EffortDriven === true,
          parentId: null,
          baseline: null,
          collapsed: false,
        })
      })

    const dependencies: Dependency[] = []
    for (const t of rawTasks) {
      const succUid = Number(t.UID)
      const succId = taskUidToId.get(succUid)
      if (!succId) continue
      for (const link of asArray(t.PredecessorLink)) {
        const predId = taskUidToId.get(Number(link.PredecessorUID))
        if (!predId) continue
        dependencies.push(
          Dependency.create({
            id: asDependencyId(this.ids.dependencyId()),
            predecessorId: asTaskId(predId),
            successorId: asTaskId(succId),
            type: LINK_TYPE_MAP[Number(link.Type ?? 1)] ?? 'FS',
            lag: Duration.of(Number(link.LinkLag ?? 0) / (10 * 60 * 8), 'd'),
          }),
        )
      }
    }

    const resourceUidToId = new Map<number, string>()
    const resources = asArray(root.Resources?.Resource)
      .filter((r) => Number(r.UID) !== 0)
      .map((r) => {
        const id = asResourceId(this.ids.resourceId())
        resourceUidToId.set(Number(r.UID), id)
        const resourceCalendarUid = Number(r.CalendarUID ?? projectCalendarUid)
        const resourceCalendarId =
          calendarUidToId.get(resourceCalendarUid) ?? calendarId
        return Resource.create({
          id,
          name: String(r.Name ?? 'Resource'),
          type: RESOURCE_TYPE_MAP[Number(r.Type ?? 1)] ?? 'work',
          email: String(r.EmailAddress ?? ''),
          group: String(r.Group ?? ''),
          maxUnits: Number(r.MaxUnits ?? 1),
          standardRate: Money.of(Number(r.StandardRate ?? 0), currency),
          overtimeRate: Money.of(Number(r.OvertimeRate ?? 0), currency),
          costPerUse: Money.of(Number(r.CostPerUse ?? 0), currency),
          calendarId: resourceCalendarId,
          notes: String(r.Notes ?? ''),
        })
      })

    const assignments = asArray(root.Assignments?.Assignment)
      .filter((a) => Number(a.TaskUID) && Number(a.ResourceUID))
      .map((a) => {
        const taskId = taskUidToId.get(Number(a.TaskUID))
        const resourceId = resourceUidToId.get(Number(a.ResourceUID))
        if (!taskId || !resourceId) return null
        return Assignment.create({
          id: asAssignmentId(this.ids.assignmentId()),
          taskId: asTaskId(taskId),
          resourceId: asResourceId(resourceId),
          units: Number(a.Units ?? 1),
          workHours: parseMspdiDuration(a.Work).toHours(),
          cost: Money.of(Number(a.Cost ?? 0), currency),
        })
      })
      .filter((a): a is Assignment => a != null)

    const startDate = parseDate(root.StartDate) ?? tasks[0]?.start ?? new Date()
    const finishDate = parseDate(root.FinishDate) ?? startDate

    return Project.create({
      id: asProjectId(this.ids.projectId()),
      name: String(root.Name || root.Title || fileName.replace(/\.[^.]+$/, '')),
      title: String(root.Title || root.Name || 'Imported Project'),
      manager: String(root.Manager || ''),
      startDate,
      finishDate,
      statusDate: parseDate(root.StatusDate),
      currency,
      calendarId,
      tasks,
      resources,
      dependencies,
      assignments,
      calendars,
      dirty: false,
      fileName,
    })
  }

  async serialize(
    project: Project,
  ): Promise<{ content: string; mimeType: string; extension: string }> {
    const taskUid = new Map<string, number>()
    project.tasks.forEach((t, i) => taskUid.set(t.id, i + 1))
    const resourceUid = new Map<string, number>()
    project.resources.forEach((r, i) => resourceUid.set(r.id, i + 1))
    const calendarUid = new Map<string, number>()
    project.calendars.forEach((c, i) => calendarUid.set(c.id, i + 1))
    const projectCalendarUid = calendarUid.get(project.calendarId) ?? 1

    const depsBySuccessor = new Map<string, Dependency[]>()
    for (const dep of project.dependencies) {
      const list = depsBySuccessor.get(dep.successorId) ?? []
      list.push(dep)
      depsBySuccessor.set(dep.successorId, list)
    }

    const xmlObj = {
      '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
      Project: {
        '@_xmlns': 'http://schemas.microsoft.com/project',
        Name: project.name,
        Title: project.title,
        Manager: project.manager,
        ScheduleFromStart: 1,
        StartDate: formatDate(project.startDate),
        FinishDate: formatDate(project.finishDate),
        CalendarUID: projectCalendarUid,
        CurrencyCode: project.currency,
        Tasks: {
          Task: [
            {
              UID: 0,
              ID: 0,
              Name: project.name,
              Type: 1,
              OutlineLevel: 0,
              Critical: 0,
              Priority: 500,
            },
            ...project.tasks.map((task, index) => {
              const links = depsBySuccessor.get(task.id) ?? []
              return {
                UID: taskUid.get(task.id),
                ID: index + 1,
                Name: task.name,
                OutlineLevel: task.outlineLevel + 1,
                WBS: task.wbs,
                Start: formatDate(task.start),
                Finish: formatDate(task.finish),
                Duration: formatMspdiDuration(task.duration),
                PercentComplete: task.percentComplete,
                Milestone: task.milestone ? 1 : 0,
                Summary: task.summary ? 1 : 0,
                Critical: task.critical ? 1 : 0,
                Priority: task.priority,
                Notes: task.notes,
                FixedCost: task.fixedCost.amount,
                Cost: task.cost.amount,
                Work: formatMspdiDuration(Duration.of(task.workHours / 8, 'd')),
                Type: SCHEDULING_TYPE_TO_MSPDI[task.schedulingType],
                EffortDriven: task.effortDriven ? 1 : 0,
                PredecessorLink: links.map((link) => ({
                  PredecessorUID: taskUid.get(link.predecessorId),
                  Type: LINK_TYPE_TO_MSPDI[link.type],
                  LinkLag: Math.round(link.lag.toDays() * 10 * 60 * 8),
                })),
              }
            }),
          ],
        },
        Resources: {
          Resource: [
            { UID: 0, ID: 0, Name: 'Unassigned', Type: 1 },
            ...project.resources.map((resource, index) => ({
              UID: resourceUid.get(resource.id),
              ID: index + 1,
              Name: resource.name,
              Type: resource.type === 'material' ? 0 : resource.type === 'cost' ? 2 : 1,
              EmailAddress: resource.email,
              Group: resource.group,
              MaxUnits: resource.maxUnits,
              StandardRate: resource.standardRate.amount,
              OvertimeRate: resource.overtimeRate.amount,
              CostPerUse: resource.costPerUse.amount,
              CalendarUID:
                calendarUid.get(resource.calendarId ?? project.calendarId) ??
                projectCalendarUid,
              Notes: resource.notes,
            })),
          ],
        },
        Assignments: {
          Assignment: project.assignments.map((a, index) => ({
            UID: index + 1,
            TaskUID: taskUid.get(a.taskId),
            ResourceUID: resourceUid.get(a.resourceId),
            Units: a.units,
            Work: formatMspdiDuration(Duration.of(a.workHours / 8, 'd')),
            Cost: a.cost.amount,
          })),
        },
        Calendars: {
          Calendar: project.calendars.map((cal) => ({
            UID: calendarUid.get(cal.id),
            Name: cal.name,
            IsBaseCalendar: cal.isBase || cal.id === project.calendarId ? 1 : 0,
            WeekDays: {
              WeekDay: cal.workDays.map((d) => ({
                DayType: d.dayOfWeek + 1,
                DayWorking: d.working ? 1 : 0,
                ...(d.working
                  ? {
                      WorkingTimes: {
                        WorkingTime: {
                          FromTime: `${String(d.startHour).padStart(2, '0')}:00:00`,
                          ToTime: `${String(d.endHour).padStart(2, '0')}:00:00`,
                        },
                      },
                    }
                  : {}),
              })),
            },
          })),
        },
      },
    }

    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      suppressEmptyNode: true,
    })
    const content = builder.build(xmlObj)
    return {
      content: String(content),
      mimeType: 'application/xml',
      extension: '.xml',
    }
  }
}
