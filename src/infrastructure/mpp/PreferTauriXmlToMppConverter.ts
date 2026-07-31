import { isTauri, invoke } from '@tauri-apps/api/core'
import type { XmlToMppConverter } from '../../application/ports/XmlToMppConverter'
import { errorMessage } from '../../presentation/errorMessage'
import { HttpXmlToMppConverter } from './HttpXmlToMppConverter'

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/**
 * Prefer Tauri `xml_to_mpp` (offline), fall back to HTTP API.
 */
export class PreferTauriXmlToMppConverter implements XmlToMppConverter {
  constructor(private readonly fallback: XmlToMppConverter = new HttpXmlToMppConverter()) {}

  async convert(xml: string, fileName = 'project.xml'): Promise<Uint8Array> {
    if (isTauri()) {
      try {
        const b64 = await invoke<string>('xml_to_mpp', { xml, fileName })
        return base64ToBytes(b64)
      } catch (error) {
        throw new Error(`MPP save failed: ${errorMessage(error)}`)
      }
    }
    return this.fallback.convert(xml, fileName)
  }
}
