/** Best-effort string from Error / Tauri invoke reject / plain values. */
export function errorMessage(error: unknown, fallback = 'Unexpected error'): string {
  if (error == null) return fallback
  if (typeof error === 'string') {
    const t = error.trim()
    return t || fallback
  }
  if (error instanceof Error) {
    return error.message.trim() || fallback
  }
  if (typeof error === 'object') {
    const o = error as Record<string, unknown>
    for (const key of ['message', 'error', 'msg', 'description'] as const) {
      const v = o[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    try {
      return JSON.stringify(error)
    } catch {
      return fallback
    }
  }
  return String(error)
}
