import type { ProgressPoint } from '../../application/services/ComputeProgressPoints'

/**
 * Renders progress lines as an SVG overlay on the DHTMLX Gantt timeline area.
 *
 * Each progress line connects from the top of the task row down to the
 * expected-progress point on the bar, then bends to the actual-progress
 * point.  Ahead-of-schedule tasks angle right; behind-schedule angle left.
 *
 * Installs an `onGanttRender` hook on the gantt instance.  The SVG overlay
 * is injected into `.gantt_data_area` and sized to match the timeline pane.
 */
export function installProgressLinesOverlay(
  gantt: {
    attachEvent: (name: string, fn: (...args: any[]) => any) => string
    detachEvent: (id: string) => void
    config: { row_height: number; scale_height: number }
    getTask: (id: string) => {
      start_date: Date
      end_date: Date
      $x?: number
      $y?: number
      $width?: number
      $height?: number
      type?: string
    } | null
    isTaskExists: (id: string) => boolean
    /** Returns the X pixel position for a given Date on the timeline. */
    posFromDate?: (date: Date) => number
  },
  getPoints: () => ProgressPoint[],
  getStatusDate: () => Date | null,
): () => void {
  const SVG_NS = 'http://www.w3.org/2000/svg'

  let svgEl: SVGSVGElement | null = null

  function render() {
    const statusDate = getStatusDate()
    const points = getPoints()

    // Remove old overlay.
    if (svgEl) {
      svgEl.remove()
      svgEl = null
    }

    if (!statusDate || points.length === 0) return

    const dataArea = document.querySelector('.gantt_data_area') as HTMLElement | null
    if (!dataArea) return

    const rowH = gantt.config.row_height
    const scaleH = gantt.config.scale_height

    // Create SVG overlay sized to the data area.
    svgEl = document.createElementNS(SVG_NS, 'svg')
    svgEl.setAttribute('class', 'supergantt-progress-lines')
    svgEl.style.position = 'absolute'
    svgEl.style.top = '0'
    svgEl.style.left = '0'
    svgEl.style.width = '100%'
    svgEl.style.height = '100%'
    svgEl.style.pointerEvents = 'none'
    svgEl.style.overflow = 'visible'
    svgEl.style.zIndex = '3'

    // Build SVG content.
    let html = ''
    const statusMs = statusDate.getTime()

    for (const pt of points) {
      // Look up the task's pixel coordinates from the gantt API.
      let taskX: number
      let taskY: number
      let taskW: number
      let taskH: number
      let barCenterY: number

      const taskObj = gantt.getTask(pt.taskId)
      if (
        taskObj &&
        typeof taskObj.$x === 'number' &&
        typeof taskObj.$y === 'number'
      ) {
        taskX = taskObj.$x
        taskY = taskObj.$y
        taskW = taskObj.$width ?? 0
        taskH = taskObj.$height ?? rowH - 5
      } else {
        // Fallback: use posFromDate + row index.
        const startX = gantt.posFromDate
          ? gantt.posFromDate(new Date(statusMs))
          : 0
        taskX = startX
        taskY = scaleH + pt.rowIndex * rowH + 5
        taskW = 1
        taskH = rowH - 10
      }

      barCenterY = taskY + taskH / 2

      // X position of the status date on the timeline.
      const statusX = gantt.posFromDate
        ? gantt.posFromDate(statusDate)
        : 0

      // Expected progress X on the bar.
      const expectedX = taskX + pt.expectedRatio * taskW
      // Actual progress X on the bar.
      const actualX = taskX + pt.actualRatio * taskW

      // Top of the task row (above the bar).
      const rowTop = taskY - 5

      // Determine color: ahead = green-ish, behind = red-ish.
      const colorClass =
        pt.variance >= 0 ? 'progress-line-ahead' : 'progress-line-behind'

      // Vertical dashed line from top of row down to the expected point.
      html += `<line x1="${statusX}" y1="${rowTop}" x2="${statusX}" y2="${barCenterY}" class="pl-vertical ${colorClass}" />`

      // Solid connector from status-date/expected intersection to actual-progress point.
      html += `<line x1="${statusX}" y1="${barCenterY}" x2="${actualX}" y2="${barCenterY}" class="pl-connector ${colorClass}" />`

      // Small dot at the expected point on the bar.
      html += `<circle cx="${statusX}" cy="${barCenterY}" r="2.5" class="pl-dot ${colorClass}" />`

      // Small dot at the actual progress point.
      html += `<circle cx="${actualX}" cy="${barCenterY}" r="2.5" class="pl-actual-dot ${colorClass}" />`
    }

    svgEl.innerHTML = html
    dataArea.appendChild(svgEl)
  }

  const handlerId = gantt.attachEvent('onGanttRender', render)

  // Also render immediately if the gantt is already initialized.
  render()

  return () => {
    gantt.detachEvent(handlerId)
    if (svgEl) {
      svgEl.remove()
      svgEl = null
    }
  }
}