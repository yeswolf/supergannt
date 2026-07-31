import { describe, expect, it, vi } from 'vitest'
import { installGanttColumnResize } from './ganttColumnResize'

describe('installGanttColumnResize', () => {
  it('updates column width on header edge drag', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="gantt_grid_scale">
        <div class="gantt_grid_head_cell" style="width:100px;height:20px"></div>
        <div class="gantt_grid_head_cell" style="width:200px;height:20px"></div>
      </div>
      <div class="gantt_grid_data"></div>
    `
    document.body.appendChild(root)
    const cells = root.querySelectorAll<HTMLElement>('.gantt_grid_head_cell')
    // jsdom layout is zero — stub getBoundingClientRect for edge hit-test.
    cells[0]!.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 100,
        top: 0,
        bottom: 20,
        width: 100,
        height: 20,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    cells[1]!.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 300,
        top: 0,
        bottom: 20,
        width: 200,
        height: 20,
        x: 100,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect

    const columns = [
      { name: 'wbs', width: 100, min_width: 48 },
      { name: 'text', width: 200, min_width: 48 },
    ]
    const render = vi.fn()
    const gantt = {
      config: { columns, keep_grid_width: true },
      getGridColumns: () => columns,
      render,
    }

    const detach = installGanttColumnResize(gantt, root)
    expect(gantt.config.keep_grid_width).toBe(false)

    cells[0]!.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 98,
        clientY: 10,
        button: 0,
      }),
    )
    window.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 130, clientY: 10 }),
    )
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    expect(columns[0]!.width).toBe(132)
    expect(render).toHaveBeenCalled()
    detach()
    document.body.removeChild(root)
  })
})
