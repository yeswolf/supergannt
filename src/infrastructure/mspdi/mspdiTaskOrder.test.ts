import { describe, expect, it } from 'vitest'
import { MspdiCodec } from './MspdiCodec'
import type { IdGenerator } from '../../application/ports/IdGenerator'
import type { Project } from '../../domain/entities/Project'

class SeqIds implements IdGenerator {
  private n = 0
  private next(prefix: string) {
    this.n += 1
    return `${prefix}${this.n}`
  }
  projectId() { return this.next('p') }
  taskId() { return this.next('t') }
  resourceId() { return this.next('r') }
  dependencyId() { return this.next('d') }
  assignmentId() { return this.next('a') }
  calendarId() { return this.next('c') }
}

/** MSPDI XML with tasks in reverse-ID order (simulating MPXJ UID-sorted output). */
const REVERSED_TASKS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>Reverse order test</Name>
  <Title>Test</Title>
  <StartDate>2026-01-01T08:00:00</StartDate>
  <CalendarUID>1</CalendarUID>
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <WeekDays>
        <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
        <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>16:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>3</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>16:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>4</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>16:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>5</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>16:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>6</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>16:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
        <WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
      </WeekDays>
    </Calendar>
  </Calendars>
  <Tasks>
    <Task>
      <UID>0</UID>
      <ID>0</ID>
      <Name>Project</Name>
      <OutlineLevel>0</OutlineLevel>
    </Task>
    <Task>
      <UID>50</UID>
      <ID>5</ID>
      <Name>Task E</Name>
      <Start>2026-01-09T08:00:00</Start>
      <Finish>2026-01-09T16:00:00</Finish>
      <Duration>PT0D8H0M0S</Duration>
      <OutlineLevel>1</OutlineLevel>
    </Task>
    <Task>
      <UID>40</UID>
      <ID>4</ID>
      <Name>Task D</Name>
      <Start>2026-01-08T08:00:00</Start>
      <Finish>2026-01-08T16:00:00</Finish>
      <Duration>PT0D8H0M0S</Duration>
      <OutlineLevel>1</OutlineLevel>
    </Task>
    <Task>
      <UID>10</UID>
      <ID>1</ID>
      <Name>Task A</Name>
      <Start>2026-01-01T08:00:00</Start>
      <Finish>2026-01-01T16:00:00</Finish>
      <Duration>PT0D8H0M0S</Duration>
      <OutlineLevel>1</OutlineLevel>
    </Task>
    <Task>
      <UID>30</UID>
      <ID>3</ID>
      <Name>Task C</Name>
      <Start>2026-01-07T08:00:00</Start>
      <Finish>2026-01-07T16:00:00</Finish>
      <Duration>PT0D8H0M0S</Duration>
      <OutlineLevel>1</OutlineLevel>
    </Task>
    <Task>
      <UID>20</UID>
      <ID>2</ID>
      <Name>Task B</Name>
      <Start>2026-01-02T08:00:00</Start>
      <Finish>2026-01-02T16:00:00</Finish>
      <Duration>PT0D8H0M0S</Duration>
      <OutlineLevel>1</OutlineLevel>
    </Task>
  </Tasks>
  <Resources>
    <Resource><UID>0</UID><ID>0</ID><Name>Unassigned</Name><Type>1</Type></Resource>
  </Resources>
</Project>`

function taskNames(project: Project): string[] {
  return project.tasks.map((t) => t.name)
}

describe('MspdiCodec task order', () => {
  const ids = new SeqIds()
  const codec = new MspdiCodec(ids)

  it('parses tasks in ID order when XML has reverse UID order', async () => {
    const project = await codec.parse(REVERSED_TASKS_XML, 'test.xml')
    expect(taskNames(project)).toEqual([
      'Task A',  // ID=1
      'Task B',  // ID=2
      'Task C',  // ID=3
      'Task D',  // ID=4
      'Task E',  // ID=5
    ])
  })

  it('re-serializes tasks preserving the sorted order', async () => {
    const project = await codec.parse(REVERSED_TASKS_XML, 'test.xml')
    const { content } = await codec.serialize(project)

    // Parse the serialized XML and check order survives
    const reopened = await new MspdiCodec(new SeqIds()).parse(content, 'test.xml')
    expect(taskNames(reopened)).toEqual([
      'Task A',
      'Task B',
      'Task C',
      'Task D',
      'Task E',
    ])
  })
})
