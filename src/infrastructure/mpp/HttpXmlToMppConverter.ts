import type { XmlToMppConverter } from '../../application/ports/XmlToMppConverter'

/** Browser/desktop client: MSPDI XML → binary .mpp via API. */
export class HttpXmlToMppConverter implements XmlToMppConverter {
  constructor(private readonly endpoint = '/api/mpp/from-xml') {}

  async convert(xml: string, fileName = 'project.xml'): Promise<Uint8Array> {
    const form = new FormData()
    form.append(
      'file',
      new Blob([xml], { type: 'application/xml' }),
      fileName.endsWith('.xml') ? fileName : `${fileName}.xml`,
    )
    const response = await fetch(this.endpoint, {
      method: 'POST',
      body: form,
    })
    if (!response.ok) {
      let detail = `MPP write failed (${response.status})`
      try {
        const payload = (await response.json()) as { error?: string }
        if (payload.error) detail = payload.error
      } catch {
        // ignore
      }
      throw new Error(detail)
    }
    return new Uint8Array(await response.arrayBuffer())
  }
}
