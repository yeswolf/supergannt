import { isTauri, invoke } from '@tauri-apps/api/core'
import type { MppToXmlConverter } from '../../application/ports/MppToXmlConverter'
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
      return invoke<string>('mpp_to_xml', {
        contentsBase64: bytesToBase64(new Uint8Array(bytes)),
        fileName,
      })
    }
    return this.fallback.convert(bytes, fileName)
  }
}
