import type { Dispatch } from 'react'
import type { AppServices, WorkspaceAction } from './state/workspace'

/** Monotonic open id — overlapping opens are ignored; never stuck after errors. */
let openSeq = 0
let activeOpen = 0

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
  dispatch({ type: 'setBusy', message: `Opening ${file.name}…` })
  try {
    const isBinary = /\.(mpp|mpt)$/i.test(file.name)
    const content = isBinary ? await file.arrayBuffer() : await readFileText(file)
    const opened = await services.files.openFile(content, file.name)
    dispatch({
      type: 'setProject',
      project: opened,
      message: `Opened ${file.name}`,
    })
  } catch (error) {
    dispatch({
      type: 'setStatus',
      message: error instanceof Error ? error.message : 'Failed to open file',
    })
  } finally {
    if (activeOpen === myOpen) activeOpen = 0
    dispatch({ type: 'setBusy', message: null })
  }
}
