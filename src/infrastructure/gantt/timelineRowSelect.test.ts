import { describe, expect, it } from 'vitest'
import { taskIdFromTimelineEmptyClick } from './timelineRowSelect'

function clickOn(html: string): Event {
  const root = document.createElement('div')
  root.innerHTML = html
  const target = root.querySelector('[data-target]') ?? root.firstElementChild!
  return { target } as unknown as Event
}

describe('taskIdFromTimelineEmptyClick', () => {
  it('returns task id from a timeline row cell click', () => {
    const e = clickOn(
      `<div class="gantt_task_row" data-task-id="t42"><div class="gantt_task_cell" data-target></div></div>`,
    )
    expect(taskIdFromTimelineEmptyClick(e)).toBe('t42')
  })

  it('ignores link clicks', () => {
    const e = clickOn(
      `<div class="gantt_task_row" data-task-id="t42"><div class="gantt_task_link" data-link-id="l1" data-target></div></div>`,
    )
    expect(taskIdFromTimelineEmptyClick(e)).toBeNull()
  })

  it('returns null outside a task row', () => {
    const e = clickOn(`<div class="gantt_task_bg" data-target></div>`)
    expect(taskIdFromTimelineEmptyClick(e)).toBeNull()
  })
})
