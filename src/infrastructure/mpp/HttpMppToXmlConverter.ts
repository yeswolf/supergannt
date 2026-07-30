import type { MppToXmlConverter } from '../../application/ports/MppToXmlConverter'

/**
 * Browser/desktop client that posts .mpp bytes to the SuperGantt conversion API
 * (backed by @byteink/mppjs / MPXJ).
 */
export class HttpMppToXmlConverter implements MppToXmlConverter {
  constructor(private readonly endpoint = '/api/mpp/to-xml') {}

  async convert(bytes: ArrayBuffer, fileName: string): Promise<string> {
    const form = new FormData()
    form.append(
      'file',
      new Blob([bytes], { type: 'application/vnd.ms-project' }),
      fileName,
    )
    const response = await fetch(this.endpoint, {
      method: 'POST',
      body: form,
    })
    if (!response.ok) {
      let detail = `MPP conversion failed (${response.status})`
      try {
        const payload = (await response.json()) as { error?: string }
        if (payload.error) detail = payload.error
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(detail)
    }
    return response.text()
  }
}
