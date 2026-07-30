import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Project } from '../../domain/entities/Project'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Cross-platform PDF export of the project task sheet + summary. */
export async function exportProjectPdf(project: Project): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const title = project.name || 'Untitled project'

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(title, 40, 36)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(
    `Start ${fmtDate(project.startDate)}  ·  Finish ${fmtDate(project.finishDate)}  ·  ` +
      `${project.tasks.length} tasks  ·  ${project.resources.length} resources  ·  ` +
      `${project.dependencies.length} links`,
    40,
    54,
  )

  const body = project.tasks.map((t, i) => [
    String(i + 1),
    t.wbs,
    `${'  '.repeat(t.outlineLevel)}${t.name}`,
    t.milestone ? '◆' : t.summary ? 'Σ' : '',
    fmtDate(t.start),
    fmtDate(t.finish),
    `${t.duration.toHours()}h`,
    `${t.percentComplete}%`,
  ])

  autoTable(doc, {
    startY: 68,
    head: [['#', 'WBS', 'Task', '', 'Start', 'Finish', 'Dur', '%']],
    body,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [15, 108, 189] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 48 },
      2: { cellWidth: 220 },
      3: { cellWidth: 18 },
      4: { cellWidth: 90 },
      5: { cellWidth: 90 },
      6: { cellWidth: 40 },
      7: { cellWidth: 36 },
    },
    didDrawPage: (data) => {
      doc.setFontSize(8)
      doc.text(
        `SuperGantt  ·  ${title}`,
        data.settings.margin.left,
        doc.internal.pageSize.getHeight() - 16,
      )
    },
  })

  return doc.output('blob')
}
