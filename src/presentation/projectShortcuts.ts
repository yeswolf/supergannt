/**
 * ProjectLibre / MS Project keyboard parity for SuperGantt.
 * Skip when focus is in an editable field (typing Delete/Insert must not mutate tasks).
 */

export type ProjectShortcut =
  | 'palette'
  | 'addTask'
  | 'deleteSelection'
  | 'indent'
  | 'outdent'
  | 'link'
  | 'unlink'
  | 'taskInfo'
  | 'assign'
  | 'zoomIn'
  | 'zoomOut'
  | 'newBlank'
  | 'open'
  | 'saveXml'

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"]',
      ),
    )
  )
}

function mod(e: KeyboardEvent): { ctrl: boolean; alt: boolean; shift: boolean } {
  return {
    ctrl: e.ctrlKey || e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
  }
}

/**
 * Map a keydown to a ProjectLibre-compatible action, or null if unmatched.
 * Caller handles dialog/palette open state for Escape separately.
 */
export function matchProjectShortcut(e: KeyboardEvent): ProjectShortcut | null {
  if (e.isComposing) return null
  const { ctrl, alt, shift } = mod(e)
  const key = e.key
  const lower = key.length === 1 ? key.toLowerCase() : key

  // Always available (even in inputs): command palette.
  if (ctrl && !alt && lower === 'k') return 'palette'

  // File / zoom shortcuts also work from most contexts except true text entry
  // for letters — but Ctrl+S/O/N are standard and rarely conflict.
  if (ctrl && !alt && !shift && lower === 'n') return 'newBlank'
  if (ctrl && !alt && !shift && lower === 'o') return 'open'
  if (ctrl && !alt && !shift && lower === 's') return 'saveXml'
  if (ctrl && !alt && (key === '=' || key === '+' || e.code === 'NumpadAdd')) {
    return 'zoomIn'
  }
  if (ctrl && !alt && (key === '-' || key === '_' || e.code === 'NumpadSubtract')) {
    return 'zoomOut'
  }

  // Task-row shortcuts: not while typing in a field.
  if (isEditableKeyboardTarget(e.target)) return null

  // Insert — add task (MS Project / ProjectLibre)
  if (!ctrl && !alt && !shift && (key === 'Insert' || e.code === 'Insert')) {
    return 'addTask'
  }

  // Delete — remove selection
  if (!ctrl && !alt && !shift && key === 'Delete') return 'deleteSelection'

  // Alt+Shift+Right / Left — indent / outdent
  if (alt && shift && !ctrl && key === 'ArrowRight') return 'indent'
  if (alt && shift && !ctrl && key === 'ArrowLeft') return 'outdent'

  // Ctrl+F2 — link; Ctrl+Shift+F2 — unlink
  if (ctrl && !alt && key === 'F2') {
    return shift ? 'unlink' : 'link'
  }

  // Shift+F2 — Task Information
  if (!ctrl && !alt && shift && key === 'F2') return 'taskInfo'

  // Ctrl+Shift+F — Assign resources (common Power User binding near Task Info)
  if (ctrl && shift && !alt && lower === 'f') return 'assign'

  return null
}

/** Human-readable chord for tooltips / palette hints. */
export const PROJECT_SHORTCUT_HINTS: Partial<Record<ProjectShortcut, string>> = {
  palette: 'Ctrl+K',
  addTask: 'Insert',
  deleteSelection: 'Delete',
  indent: 'Alt+Shift+→',
  outdent: 'Alt+Shift+←',
  link: 'Ctrl+F2',
  unlink: 'Ctrl+Shift+F2',
  taskInfo: 'Shift+F2',
  assign: 'Ctrl+Shift+F',
  zoomIn: 'Ctrl+=',
  zoomOut: 'Ctrl+-',
  newBlank: 'Ctrl+N',
  open: 'Ctrl+O',
  saveXml: 'Ctrl+S',
}
