import '@testing-library/jest-dom/vitest'

class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver
}
