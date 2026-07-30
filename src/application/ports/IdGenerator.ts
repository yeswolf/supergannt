export interface IdGenerator {
  projectId(): string
  taskId(): string
  resourceId(): string
  dependencyId(): string
  assignmentId(): string
  calendarId(): string
}
