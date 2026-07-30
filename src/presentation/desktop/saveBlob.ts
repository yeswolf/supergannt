/**
 * Persist a Blob to disk.
 *
 * Order:
 * 1) Tauri `save_file` command (when IPC survives remote navigate)
 * 2) Chromium/WebView2 `showSaveFilePicker`
 * 3) `<a download>` fallback (browsers only — often a no-op in WebView2)
 */

type SaveFilePickerOptions = {
  suggestedName?: string
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<{
    name: string
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function acceptForFileName(fileName: string): SaveFilePickerOptions['types'] {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase()
  if (ext === 'xml' || ext === 'mspdi') {
    return [{ description: 'MSPDI XML', accept: { 'application/xml': ['.xml', '.mspdi'] } }]
  }
  if (ext === 'mpp' || ext === 'mpt') {
    return [
      {
        description: 'Microsoft Project',
        accept: { 'application/vnd.ms-project': ['.mpp', '.mpt'] },
      },
    ]
  }
  if (ext === 'mpx') {
    return [{ description: 'MPX', accept: { 'application/octet-stream': ['.mpx'] } }]
  }
  if (ext === 'pdf') {
    return [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
  }
  return undefined
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }
  return new Uint8Array(await new Response(blob).arrayBuffer())
}

async function saveWithFilePicker(blob: Blob, fileName: string): Promise<string | null> {
  const w = window as SaveFilePickerWindow
  if (typeof w.showSaveFilePicker !== 'function') {
    throw new Error('showSaveFilePicker unavailable')
  }

  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: fileName,
      types: acceptForFileName(fileName),
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return handle.name || fileName
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

/** ok=false → Tauri IPC unavailable; ok=true → dialog ran (path may be null if cancelled). */
async function tryTauriSave(
  blob: Blob,
  fileName: string,
): Promise<{ ok: true; path: string | null } | { ok: false }> {
  if (!isTauri()) return { ok: false }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const bytes = await blobToBytes(blob)
    const path = await invoke<string | null>('save_file', {
      defaultName: fileName,
      contentsBase64: bytesToBase64(bytes),
    })
    return { ok: true, path }
  } catch {
    return { ok: false }
  }
}

/**
 * @returns Absolute/display path written, or `fileName` for browser download, or `null` if cancelled.
 */
export async function saveBlobToDisk(
  blob: Blob,
  fileName: string,
): Promise<string | null> {
  const tauri = await tryTauriSave(blob, fileName)
  if (tauri.ok) return tauri.path

  try {
    return await saveWithFilePicker(blob, fileName)
  } catch (pickerError) {
    if (isTauri()) {
      throw pickerError instanceof Error
        ? pickerError
        : new Error('Could not open a Save dialog in the desktop shell')
    }
    downloadBlob(blob, fileName)
    return fileName
  }
}
