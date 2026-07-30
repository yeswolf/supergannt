export type TaskId = string & { readonly __brand: 'TaskId' }
export type ResourceId = string & { readonly __brand: 'ResourceId' }
export type DependencyId = string & { readonly __brand: 'DependencyId' }
export type AssignmentId = string & { readonly __brand: 'AssignmentId' }
export type CalendarId = string & { readonly __brand: 'CalendarId' }
export type ProjectId = string & { readonly __brand: 'ProjectId' }

export function asTaskId(value: string): TaskId {
  return value as TaskId
}

export function asResourceId(value: string): ResourceId {
  return value as ResourceId
}

export function asDependencyId(value: string): DependencyId {
  return value as DependencyId
}

export function asAssignmentId(value: string): AssignmentId {
  return value as AssignmentId
}

export function asCalendarId(value: string): CalendarId {
  return value as CalendarId
}

export function asProjectId(value: string): ProjectId {
  return value as ProjectId
}
