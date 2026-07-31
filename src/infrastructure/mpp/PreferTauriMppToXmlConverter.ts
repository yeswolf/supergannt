import { isTauri, invoke } from '@tauri-apps/api/core'
import type { MppToXmlConverter } from '../../application/ports/MppToXmlConverter'
import { errorMessage } from '../../presentation/errorMessage'
import { HttpMppToXmlConverter } from './HttpMppToXmlConverter'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Prefer in-process Tauri conversion (offline desktop/Android), fall back to HTTP API.
 */
export class PreferTauriMppToXmlConverter implements MppToXmlConverter {
  constructor(private readonly fallback: MppToXmlConverter = new HttpMppToXmlConverter()) {}

  async convert(bytes: ArrayBuffer, fileName: string): Promise<string> {
    if (isTauri()) {
      try {
        return await invoke<string>('mpp_to_xml', {
          contentsBase64: bytesToBase64(new Uint8Array(bytes)),
          fileName,
        })
      } catch (error) {
        throw new Error(`MPP open failed: ${errorMessage(error)}`)
      }
    }
    return this.fallback.convert(bytes, fileName)
  }
}
