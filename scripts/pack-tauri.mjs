/**
 * Stage + build SuperGantt Tauri (WebView2) Windows installer.
 *
 * Slim pack (default): UI + API + jar only. Portable Node/JRE are downloaded
 * during NSIS install (hooks) into %LOCALAPPDATA%/SuperGantt/runtime; the app
 * still falls back to first-launch download if that step was skipped/offline.
 *
 * Usage:
 *   node scripts/pack-tauri.mjs --stage        # stage resources only
 *   node scripts/pack-tauri.mjs               # stage + tauri build (NSIS)
 *   node scripts/pack-tauri.mjs --with-node   # fat pack (embed node.exe)
 */
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { access, cp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const stageOnly = process.argv.includes('--stage')
const withNode = process.argv.includes('--with-node')
const NODE_VERSION = process.env.SUPERGANNT_NODE_VERSION ?? '22.17.0'

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...opts,
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`))
    })
  })
}

async function exists(p) {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close()
          download(res.headers.location, dest).then(resolve, reject)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`download ${url} → HTTP ${res.statusCode}`))
          return
        }
        pipeline(res, file).then(resolve, reject)
      })
      .on('error', reject)
  })
}

async function ensurePortableNode(nodeDir) {
  const nodeExe = path.join(nodeDir, process.platform === 'win32' ? 'node.exe' : 'node')
  if (await exists(nodeExe)) {
    const st = await stat(nodeExe)
    console.log(`Using portable Node (${Math.round(st.size / 1024 / 1024)} MB)`)
    return
  }

  await mkdir(nodeDir, { recursive: true })
  if (process.platform !== 'win32') {
    throw new Error('pack-tauri currently stages portable Node for Windows only')
  }

  const zipName = `node-v${NODE_VERSION}-win-x64.zip`
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${zipName}`
  const tmpZip = path.join(os.tmpdir(), zipName)
  console.log(`Downloading portable Node ${NODE_VERSION}…`)
  await download(url, tmpZip)

  const extractDir = path.join(os.tmpdir(), `node-extract-${process.pid}`)
  await rm(extractDir, { recursive: true, force: true })
  await mkdir(extractDir, { recursive: true })

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${tmpZip}' -DestinationPath '${extractDir}' -Force`],
  )

  const extractedRoot = path.join(extractDir, `node-v${NODE_VERSION}-win-x64`)
  await cp(path.join(extractedRoot, 'node.exe'), nodeExe)
  await rm(extractDir, { recursive: true, force: true })
  await rm(tmpZip, { force: true })
  console.log(`Staged ${nodeExe}`)
}

async function stageResources() {
  const jar = path.join(root, 'server', 'java', 'target', 'mpp-convert.jar')
  if (!(await exists(jar))) {
    console.log('mpp-convert.jar missing — running mpp:setup…')
    await run('npm', ['run', 'mpp:setup'])
  } else {
    const st = await stat(jar)
    console.log(`Using existing jar (${Math.round(st.size / 1024 / 1024)} MB)`)
  }

  console.log('Building web UI…')
  await run('npx', ['vite', 'build'])

  console.log('Bundling API server…')
  await run('node', ['scripts/bundle-server.mjs'])

  const resources = path.join(root, 'src-tauri', 'resources')
  await rm(resources, { recursive: true, force: true })
  await mkdir(path.join(resources, 'server'), { recursive: true })
  await mkdir(path.join(resources, 'mpp'), { recursive: true })
  await mkdir(path.join(resources, 'ui'), { recursive: true })

  await cp(path.join(root, 'dist-server', 'index.mjs'), path.join(resources, 'server', 'index.mjs'))
  await cp(jar, path.join(resources, 'mpp', 'mpp-convert.jar'))
  await cp(
    path.join(root, 'server', 'java', 'templates', 'blank.mpp'),
    path.join(resources, 'mpp', 'blank.mpp'),
  )
  await cp(path.join(root, 'dist'), path.join(resources, 'ui'), { recursive: true })
  await cp(
    path.join(root, 'src-tauri', 'windows', 'ensure-runtime.ps1'),
    path.join(resources, 'ensure-runtime.ps1'),
  )

  if (withNode) {
    await mkdir(path.join(resources, 'node'), { recursive: true })
    await ensurePortableNode(path.join(resources, 'node'))
    console.log('Fat pack: Node embedded in installer')
  } else {
    console.log('Slim pack: Node/JRE download during NSIS install (app fallback on first use)')
  }

  await writeFile(path.join(resources, '.gitkeep'), '')
  console.log(`Staged Tauri resources → ${resources}`)
}

async function main() {
  await stageResources()
  if (stageOnly) return

  // Kill running app so cargo can overwrite supergannt.exe
  if (process.platform === 'win32') {
    await run('taskkill', ['/F', '/IM', 'supergannt.exe']).catch(() => {})
  }

  console.log('Building Tauri NSIS installer…')
  if (process.platform === 'win32') {
    await run('cmd.exe', ['/c', path.join(root, 'scripts', 'build-tauri-win.cmd')])
  } else {
    await run('npx', ['tauri', 'build', '--bundles', 'nsis'])
  }

  const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
  const outDir = path.join(root, 'release-tauri')
  await mkdir(outDir, { recursive: true })
  if (await exists(bundleDir)) {
    await cp(bundleDir, outDir, { recursive: true })
  }

  const setup = path.join(outDir, 'SuperGantt_1.0.1_x64-setup.exe')
  if (await exists(setup)) {
    const st = await stat(setup)
    console.log(`Installer: ${setup} (${(st.size / 1024 / 1024).toFixed(1)} MB)`)
  } else {
    console.log(`Tauri installer(s) copied to ${outDir}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
