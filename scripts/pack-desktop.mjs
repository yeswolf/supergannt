/**
 * Build Windows installer / unpacked Electron package.
 *
 * Steps:
 *  1) Ensure mpp-convert.jar (JDK/Maven auto-fetched if needed)
 *  2) Vite UI build
 *  3) Bundle API server
 *  4) electron-builder → release/
 *
 * Usage:
 *   npm run desktop:pack        # NSIS installer
 *   npm run desktop:pack:dir    # unpacked folder only
 */
import { spawn } from 'node:child_process'
import { access, cp, mkdir, rm, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dirOnly = process.argv.includes('--dir')

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

async function main() {
  const jar = path.join(root, 'server', 'java', 'target', 'mpp-convert.jar')
  if (!(await exists(jar))) {
    console.log('mpp-convert.jar missing — running mpp:setup…')
    await run('npm', ['run', 'mpp:setup'])
  } else {
    const st = await stat(jar)
    console.log(`Using existing jar (${Math.round(st.size / 1024 / 1024)} MB)`)
  }

  console.log('Building web UI…')
  await run('npm', ['run', 'build'])

  console.log('Bundling API server…')
  await run('node', ['scripts/bundle-server.mjs'])

  const stage = path.join(root, 'build-desktop')
  await rm(stage, { recursive: true, force: true })
  await mkdir(path.join(stage, 'server'), { recursive: true })
  await mkdir(path.join(stage, 'mpp'), { recursive: true })
  await mkdir(path.join(stage, 'ui'), { recursive: true })
  // node_modules intentionally omitted from the desktop stage (see pack notes).

  await cp(path.join(root, 'dist-server', 'index.mjs'), path.join(stage, 'server', 'index.mjs'))
  await cp(jar, path.join(stage, 'mpp', 'mpp-convert.jar'))
  await cp(
    path.join(root, 'server', 'java', 'templates', 'blank.mpp'),
    path.join(stage, 'mpp', 'blank.mpp'),
  )
  await cp(path.join(root, 'dist'), path.join(stage, 'ui'), { recursive: true })

  const stagedIndex = path.join(stage, 'ui', 'index.html')
  if (!(await exists(stagedIndex))) {
    throw new Error(`UI staging failed — missing ${stagedIndex} (did vite build emit dist/index.html?)`)
  }

  // Do NOT stage @byteink/mppjs native binaries (~62MB exe, often duplicated in
  // asar). Packaged app uses mpp-convert.jar + auto JRE exclusively.

  // Build outside the repo first — Windows AV/OneDrive often EPERM-locks ./release renames.
  const stagingOut = path.join(os.tmpdir(), `supergannt-electron-${process.pid}`)
  await rm(stagingOut, { recursive: true, force: true })
  await mkdir(stagingOut, { recursive: true })

  console.log('Packaging Electron app…')
  const builderArgs = [
    'electron-builder',
    '--win',
    '--x64',
    `--config.directories.output=${stagingOut}`,
  ]
  if (dirOnly) builderArgs.push('--dir')
  else builderArgs.push('--config.win.target=nsis')

  await run('npx', builderArgs, {
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
  })

  const finalOut = path.join(root, 'release')
  await rm(finalOut, { recursive: true, force: true })
  await mkdir(finalOut, { recursive: true })
  await cp(stagingOut, finalOut, { recursive: true })
  await rm(stagingOut, { recursive: true, force: true })

  console.log('\nDone. Output under release/')
  if (dirOnly) {
    console.log('  Unpacked: release/win-unpacked/SuperGantt.exe')
  } else {
    console.log('  Installer: release/SuperGantt-Setup-*.exe')
  }
  console.log(
    '  First MPP open may download Temurin JRE into %APPDATA%\\supergannt\\runtime if Java 17+ is missing.',
  )
  console.log(
    '  Size tip: installer ships JAR-only MPP (no native mppjs) + en-US Electron locale.',
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
