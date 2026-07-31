import { describe, expect, it } from 'vitest'
import { stripOriginalMppTrailer } from './originalMppTrailer'

describe('stripOriginalMppTrailer', () => {
  it('returns xml unchanged without trailer', () => {
    const xml = '<?xml version="1.0"?><Project><Name>A</Name></Project>'
    expect(stripOriginalMppTrailer(xml)).toBe(xml)
  })

  it('strips identity trailer after Project root', () => {
    const xml =
      '<?xml version="1.0"?><Project><Name>A</Name></Project>\n' +
      '<!--SuperGanttOriginalMpp:begin:sha256=ab:len=4-->\nAAAA\n' +
      '<!--SuperGanttOriginalMpp:end-->\n'
    expect(stripOriginalMppTrailer(xml)).toBe(
      '<?xml version="1.0"?><Project><Name>A</Name></Project>',
    )
  })
})
