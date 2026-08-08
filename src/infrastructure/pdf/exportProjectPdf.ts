import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Project } from '../../domain/entities/Project'
import type { Task } from '../../domain/entities/Task'
import { computeProgressPoints } from '../../application/services/ComputeProgressPoints'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** ASCII-only dates — Helvetica cannot render many Unicode punctuation glyphs. */
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function taskKind(t: Task): string {
  if (t.milestone) return 'M'
  if (t.summary) return 'S'
  return ''
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1))}~`
}

function projectTimeRange(project: Project): { minMs: number; maxMs: number } {
  let minMs = project.startDate.getTime()
  let maxMs = project.finishDate.getTime()
  for (const t of project.tasks) {
    minMs = Math.min(minMs, t.start.getTime())
    maxMs = Math.max(maxMs, t.finish.getTime(), t.start.getTime())
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) {
    const now = Date.now()
    return { minMs: now, maxMs: now + 7 * 24 * 3600_000 }
  }
  // Pad 2% so bars are not flush with edges
  const padMs = Math.max((maxMs - minMs) * 0.02, 3600_000)
  return { minMs: minMs - padMs, maxMs: maxMs + padMs }
}

function drawFooter(doc: jsPDF, title: string): void {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80)
  doc.text(
    `SuperGantt - ${truncate(title, 60)}`,
    40,
    doc.internal.pageSize.getHeight() - 16,
  )
  doc.setTextColor(0)
}

function drawTaskTable(doc: jsPDF, project: Project, title: string): void {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(title, 40, 36)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(
    `Start ${fmtDate(project.startDate)}  |  Finish ${fmtDate(project.finishDate)}  |  ` +
      `${project.tasks.length} tasks  |  ${project.resources.length} resources  |  ` +
      `${project.dependencies.length} links`,
    40,
    54,
  )

  const body = project.tasks.map((t, i) => [
    String(i + 1),
    t.wbs,
    `${'  '.repeat(t.outlineLevel)}${t.name}`,
    taskKind(t),
    fmtDate(t.start),
    fmtDate(t.finish),
    `${t.duration.toHours()}h`,
    `${t.percentComplete}%`,
  ])

  autoTable(doc, {
    startY: 68,
    margin: { left: 40, right: 40 },
    tableWidth: 'auto',
    head: [['#', 'WBS', 'Task', 'T', 'Start', 'Finish', 'Dur', '%']],
    body,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 108, 189], font: 'helvetica' },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 40 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 78 },
      5: { cellWidth: 78 },
      6: { cellWidth: 32 },
      7: { cellWidth: 28 },
    },
    didDrawPage: () => drawFooter(doc, title),
  })
}

/** Simple landscape Gantt chart drawn from domain dates (no UI dependency). */
function drawGanttChart(
  doc: jsPDF,
  project: Project,
  title: string,
  statusDate?: Date | null,
): void {
  doc.addPage('a4', 'landscape')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const labelW = 150
  const chartLeft = margin + labelW
  const chartRight = pageW - margin
  const chartW = chartRight - chartLeft
  const top = 56
  const bottom = pageH - 36
  const rowH = 16

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`${title} - Gantt`, margin, 32)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('M = milestone, S = summary, red = critical', margin, 44)

  const { minMs, maxMs } = projectTimeRange(project)
  const span = Math.max(1, maxMs - minMs)
  const xAt = (ms: number) => chartLeft + ((ms - minMs) / span) * chartW

  // Time grid + day ticks
  doc.setDrawColor(200)
  doc.setLineWidth(0.4)
  const tickCount = 8
  for (let i = 0; i <= tickCount; i++) {
    const ms = minMs + (span * i) / tickCount
    const x = xAt(ms)
    doc.line(x, top, x, bottom)
    doc.setFontSize(7)
    doc.setTextColor(90)
    doc.text(fmtDay(new Date(ms)), x + 2, top - 6)
    doc.setTextColor(0)
  }
  doc.setDrawColor(180)
  doc.rect(chartLeft, top, chartW, bottom - top)

  const tasks = project.tasks
  let y = top + 4
  let pageIndex = 1

  const ensureSpace = () => {
    if (y + rowH <= bottom) return
    drawFooter(doc, title)
    doc.addPage('a4', 'landscape')
    pageIndex += 1
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(`${title} - Gantt (cont. ${pageIndex})`, margin, 32)
    y = top
    doc.setDrawColor(200)
    for (let i = 0; i <= tickCount; i++) {
      const x = xAt(minMs + (span * i) / tickCount)
      doc.line(x, top, x, bottom)
    }
    doc.setDrawColor(180)
    doc.rect(chartLeft, top, chartW, bottom - top)
  }

  for (const task of tasks) {
    ensureSpace()
    const label = truncate(`${task.wbs} ${task.name}`, 28)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(task.critical ? 180 : 30, task.critical ? 40 : 30, task.critical ? 40 : 30)
    doc.text(label, margin, y + 10)
    doc.setTextColor(0)

    const x1 = xAt(task.start.getTime())
    const x2 = xAt(Math.max(task.finish.getTime(), task.start.getTime()))
    const barY = y + 4
    const barH = 8

    if (task.milestone) {
      const cx = x1
      const cy = barY + barH / 2
      const r = 4
      doc.setFillColor(15, 108, 189)
      doc.triangle(cx, cy - r, cx + r, cy, cx, cy + r, 'F')
      doc.triangle(cx, cy - r, cx - r, cy, cx, cy + r, 'F')
    } else if (task.summary) {
      doc.setFillColor(43, 87, 154)
      doc.rect(x1, barY, Math.max(2, x2 - x1), barH, 'F')
      // End caps
      doc.rect(x1, barY, 2, barH + 2, 'F')
      doc.rect(Math.max(x1, x2 - 2), barY, 2, barH + 2, 'F')
    } else {
      if (task.critical) doc.setFillColor(209, 52, 56)
      else doc.setFillColor(91, 155, 213)
      doc.rect(x1, barY, Math.max(2, x2 - x1), barH, 'F')
      if (task.percentComplete > 0) {
        const prog = Math.min(100, Math.max(0, task.percentComplete)) / 100
        doc.setFillColor(43, 87, 154)
        doc.rect(x1, barY, Math.max(1, (x2 - x1) * prog), barH, 'F')
      }
    }

    y += rowH
  }

  // Progress lines — drawn after bars so they sit on top.
  if (statusDate) {
    const points = computeProgressPoints(project, statusDate)
    for (const pt of points) {
      const task = project.tasks[pt.rowIndex]
      if (!task) continue
      if (pt.rowIndex >= rowsPerPage) continue

      const taskX1 = xAt(task.start.getTime())
      const taskX2 = xAt(Math.max(task.finish.getTime(), task.start.getTime()))
      const barY = top + 4 + pt.rowIndex * rowH + 4
      const barH = 8
      const barCenterY = barY + barH / 2
      const statusX = xAt(statusDate.getTime())
      const expectedX = taskX1 + pt.expectedRatio * Math.max(2, taskX2 - taskX1)
      const actualX = taskX1 + pt.actualRatio * Math.max(2, taskX2 - taskX1)
      const rowTop = top + 4 + pt.rowIndex * rowH

      const isBehind = pt.variance < 0
      if (isBehind) {
        doc.setDrawColor(209, 52, 56) // red
      } else {
        doc.setDrawColor(22, 163, 74) // green
      }
      doc.setLineWidth(1)

      // Vertical dashed line (approximate dashes for PDF).
      doc.setLineDashPattern([3, 2], 0)
      doc.line(statusX, rowTop, statusX, barCenterY)

      // Solid connector.
      doc.setLineDashPattern([], 0)
      doc.line(statusX, barCenterY, actualX, barCenterY)

      // Dots.
      doc.setLineDashPattern([], 0)
      doc.setFillColor(isBehind ? 209 : 22, isBehind ? 52 : 163, isBehind ? 56 : 74)
      doc.circle(statusX, barCenterY, 1.5, 'F')
      doc.circle(actualX, barCenterY, 1.5, 'F')
    }
    doc.setDrawColor(0)
    doc.setLineWidth(0.5)
    doc.setLineDashPattern([], 0)
  }

  // Dependency stubs (FS only, light) — keep sparse so PDF stays readable
  doc.setDrawColor(120)
  doc.setLineWidth(0.5)
  const rowIndex = new Map(tasks.map((t, i) => [t.id, i]))
  const rowsPerPage = Math.max(1, Math.floor((bottom - top - 4) / rowH))
  for (const dep of project.dependencies) {
    if (dep.type !== 'FS') continue
    const fi = rowIndex.get(dep.predecessorId)
    const ti = rowIndex.get(dep.successorId)
    if (fi == null || ti == null) continue
    // Only draw when both on the first chart page worth of rows (avoid wrong Y after page breaks)
    if (fi >= rowsPerPage || ti >= rowsPerPage) continue
    const from = tasks[fi]!
    const to = tasks[ti]!
    const xFrom = xAt(from.finish.getTime())
    const xTo = xAt(to.start.getTime())
    const yFrom = top + 4 + fi * rowH + 8
    const yTo = top + 4 + ti * rowH + 8
    doc.line(xFrom, yFrom, xFrom + 6, yFrom)
    doc.line(xFrom + 6, yFrom, xFrom + 6, yTo)
    doc.line(xFrom + 6, yTo, xTo, yTo)
  }

  drawFooter(doc, title)
}

/**
 * Cross-platform PDF export: task table + Gantt chart.
 * Uses Helvetica only (no Unicode symbols that become mojibake).
 */
export async function exportProjectPdf(
  project: Project,
  statusDate?: Date | null,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const title = project.name || 'Untitled project'

  drawTaskTable(doc, project, title)
  drawGanttChart(doc, project, title, statusDate)

  return doc.output('blob')
}
