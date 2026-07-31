import type { Dispatch } from 'react'
import { errorMessage } from './errorMessage'
import type { AppServices, WorkspaceAction } from './state/workspace'

/** Monotonic open id — overlapping opens are ignored; never stuck after errors. */
let openSeq = 0
let activeOpen = 0

/** OLE Compound File magic (MS Project .mpp / .mpt). */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

/** @internal test helper */
export function resetOpenPlanFileForTests(): void {
  openSeq = 0
  activeOpen = 0
}

/** Read text; `File.text()` is missing in some runtimes (e.g. jsdom). */
async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer())
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

function looksLikeOle(bytes: Uint8Array): boolean {
  if (bytes.length < OLE_MAGIC.length) return false
  return OLE_MAGIC.every((b, i) => bytes[i] === b)
}

function looksLikeXml(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, 64)).trimStart()
  return head.startsWith('<') || head.startsWith('\uFEFF<')
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * Android SAF / WebView sometimes omits `.mpp` in `File.name`.
 * Sniff content and normalize so codecs route correctly.
 */
function resolveOpenName(file: File, bytes: Uint8Array | null): string {
  const raw = (file.name || '').trim()
  const base = raw.split(/[/\\]/).pop() || raw
  if (/\.(mpp|mpt|xml|mspdi|mpx)$/i.test(base)) return base
  if (bytes && looksLikeOle(bytes)) {
    const stem = base && !base.includes('.') ? base : base.replace(/\.[^.]+$/, '') || 'project'
    return `${stem}.mpp`
  }
  if (bytes && looksLikeXml(bytes)) {
    const stem = base && !base.includes('.') ? base : base.replace(/\.[^.]+$/, '') || 'project'
    return `${stem}.xml`
  }
  return base || 'project.bin'
}

/**
 * Shared entry for opening/importing a plan file (MPP, XML, …).
 * Always shows the workspace busy loader for the full read+parse path.
 */
export async function openPlanFile(
  file: File,
  services: AppServices,
  dispatch: Dispatch<WorkspaceAction>,
): Promise<void> {
  if (activeOpen !== 0) return
  const myOpen = ++openSeq
  activeOpen = myOpen
  const label = file.name || 'file'
  dispatch({ type: 'setBusy', message: `Opening ${label}…` })
  try {
    const namedText = /\.(xml|mspdi|mpx)$/i.test(file.name)
    const bytes = namedText ? null : await readFileBytes(file)
    const fileName = resolveOpenName(file, bytes)
    const isBinary = /\.(mpp|mpt)$/i.test(fileName)

    let content: string | ArrayBuffer
    if (isBinary) {
      const raw = bytes ?? (await readFileBytes(file))
      content = toArrayBuffer(raw)
    } else if (bytes && looksLikeXml(bytes)) {
      content = new TextDecoder().decode(bytes)
    } else {
      content = await readFileText(file)
    }

    const opened = await services.files.openFile(content, fileName)
    dispatch({
      type: 'setProject',
      project: opened,
      message: `Opened ${fileName}`,
    })
  } catch (error) {
    dispatch({
      type: 'setStatus',
      message: errorMessage(error, 'Failed to open file'),
    })
  } finally {
    if (activeOpen === myOpen) activeOpen = 0
    dispatch({ type: 'setBusy', message: null })
  }
}
