import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/domain/**',
        'src/application/**',
        'src/infrastructure/**',
        'src/presentation/state/workspace.ts',
      ],
      exclude: [
        'src/presentation/components/**',
        'src/presentation/state/WorkspaceContext.tsx',
        'src/application/ports/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/App.tsx',
        'src/test/**',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
