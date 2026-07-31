const BEGIN = '<!--SuperGanttOriginalMpp:begin:'

/** Drop SuperGantt identity trailer (invalid XML after `</Project>`). */
export function stripOriginalMppTrailer(xml: string): string {
  const idx = xml.lastIndexOf(BEGIN)
  if (idx < 0) return xml
  return xml.slice(0, idx).trimEnd()
}
