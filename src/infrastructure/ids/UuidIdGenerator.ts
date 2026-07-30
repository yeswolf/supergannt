import { v4 as uuid } from 'uuid'
import type { IdGenerator } from '../../application/ports/IdGenerator'

export class UuidIdGenerator implements IdGenerator {
  projectId(): string {
    return uuid()
  }
  taskId(): string {
    return uuid()
  }
  resourceId(): string {
    return uuid()
  }
  dependencyId(): string {
    return uuid()
  }
  assignmentId(): string {
    return uuid()
  }
  calendarId(): string {
    return uuid()
  }
}
