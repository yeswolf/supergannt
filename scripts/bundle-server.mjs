/**
 * Bundle the Hono MPP API for the Tauri desktop sidecar (Node runtime).
 */
import * as esbuild from 'esbuild'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outdir = path.join(root, 'dist-server')

await mkdir(outdir, { recursive: true })

await esbuild.build({
  entryPoints: [path.join(root, 'server', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: path.join(outdir, 'index.mjs'),
  packages: 'bundle',
  // Optional native fallback — never bundled into the desktop server (JAR only).
  external: [
    '@byteink/mppjs',
    '@byteink/mppjs-win32-x64',
    '@byteink/mppjs-linux-x64',
    '@byteink/mppjs-linux-arm64',
    '@byteink/mppjs-darwin-arm64',
  ],
  logLevel: 'info',
})

console.log(`Bundled API → ${path.join(outdir, 'index.mjs')}`)
