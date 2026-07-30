/**
 * Builds server/java/target/mpp-convert.jar (skips AWT/presentation data).
 * Optionally downloads a Temurin 21 JRE into server/.runtime/jdk when no JDK 17+ is found.
 *
 * Usage: node scripts/setup-mpp.mjs
 */
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import {
  access,
  chmod,
  mkdir,
  readdir,
  rm,
  stat,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const javaDir = path.join(root, 'server', 'java')
const runtimeDir = path.join(root, 'server', '.runtime')
const jdkDir = path.join(runtimeDir, 'jdk')

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      // Only use shell for .cmd/.bat shims on Windows.
      shell:
        process.platform === 'win32' &&
        /\.(cmd|bat)$/i.test(command),
      ...opts,
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited ${code}`))
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

function javaVersion(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    child.stderr.on('data', (c) => {
      err += c.toString()
    })
    child.stdout.on('data', (c) => {
      err += c.toString()
    })
    child.on('error', () => resolve(null))
    child.on('close', () => {
      const m = /version\s+"(\d+)/i.exec(err)
      resolve(m ? Number(m[1]) : null)
    })
  })
}

async function findModernJava() {
  const candidates = []
  if (process.env.JAVA_HOME) {
    candidates.push(
      path.join(
        process.env.JAVA_HOME,
        'bin',
        process.platform === 'win32' ? 'java.exe' : 'java',
      ),
    )
  }
  candidates.push(path.join(jdkDir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))
  candidates.push('java')
  for (const bin of candidates) {
    const v = await javaVersion(bin)
    if (v != null && v >= 17) return { bin, version: v }
  }
  return null
}

function adoptiumUrl() {
  const os =
    process.platform === 'win32'
      ? 'windows'
      : process.platform === 'darwin'
        ? 'mac'
        : 'linux'
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
  // JRE is enough to run the shaded jar; we need JDK only if compiling without Maven toolchain.
  return `https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}/jdk/hotspot/normal/eclipse?project=jdk`
}

async function download(url, dest) {
  console.log(`Downloading ${url}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Download failed ${res.status} ${url}`)
  await mkdir(path.dirname(dest), { recursive: true })
  await pipeline(res.body, createWriteStream(dest))
}

async function extractArchive(archive, dest) {
  await mkdir(dest, { recursive: true })
  if (archive.endsWith('.zip')) {
    if (process.platform === 'win32') {
      await run('powershell.exe', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path '${archive.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`,
      ])
    } else {
      await run('unzip', ['-q', archive, '-d', dest])
    }
  } else {
    await run('tar', ['-xzf', archive, '-C', dest])
  }
}

async function normalizeJdkLayout(extractRoot) {
  // Adoptium archives extract to a single versioned folder.
  const entries = await readdir(extractRoot, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  if (dirs.length !== 1) return
  const nested = path.join(extractRoot, dirs[0])
  const staging = path.join(path.dirname(extractRoot), 'jdk-staging')
  await rm(staging, { recursive: true, force: true })
  // Prefer copy on Windows — rename across AV locks often hits EPERM.
  await run(
    process.platform === 'win32' ? 'powershell.exe' : 'cp',
    process.platform === 'win32'
      ? [
          '-NoProfile',
          '-Command',
          `Copy-Item -Path '${nested.replace(/'/g, "''")}' -Destination '${staging.replace(/'/g, "''")}' -Recurse -Force`,
        ]
      : ['-a', nested, staging],
  )
  await rm(extractRoot, { recursive: true, force: true })
  await rm(jdkDir, { recursive: true, force: true })
  await run(
    process.platform === 'win32' ? 'powershell.exe' : 'mv',
    process.platform === 'win32'
      ? [
          '-NoProfile',
          '-Command',
          `Move-Item -Path '${staging.replace(/'/g, "''")}' -Destination '${jdkDir.replace(/'/g, "''")}' -Force`,
        ]
      : [staging, jdkDir],
  )
}

async function ensureJdk() {
  const existing = await findModernJava()
  if (existing) {
    console.log(`Using Java ${existing.version}: ${existing.bin}`)
    return existing
  }

  console.log('No JDK 17+ found — downloading Eclipse Temurin 21…')
  await rm(runtimeDir, { recursive: true, force: true })
  await mkdir(runtimeDir, { recursive: true })
  const isWin = process.platform === 'win32'
  const archive = path.join(runtimeDir, isWin ? 'jdk.zip' : 'jdk.tar.gz')
  await download(adoptiumUrl(), archive)
  const extractTo = path.join(runtimeDir, 'jdk-extract')
  await rm(extractTo, { recursive: true, force: true })
  await extractArchive(archive, extractTo)
  await normalizeJdkLayout(extractTo)
  await rm(archive, { force: true })

  const bin = path.join(jdkDir, 'bin', isWin ? 'java.exe' : 'java')
  if (!isWin) await chmod(bin, 0o755)
  const v = await javaVersion(bin)
  if (v == null || v < 17) throw new Error('Downloaded JDK is not usable')
  console.log(`Installed Temurin ${v} at ${jdkDir}`)
  return { bin, version: v }
}

async function findMaven() {
  const local = path.join(
    runtimeDir,
    'maven',
    'bin',
    process.platform === 'win32' ? 'mvn.cmd' : 'mvn',
  )
  if (await exists(local)) return local
  for (const cmd of process.platform === 'win32' ? ['mvn.cmd', 'mvn'] : ['mvn']) {
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(cmd, ['-v'], { stdio: 'ignore', shell: true })
        child.on('error', reject)
        child.on('close', (code) => (code === 0 ? resolve() : reject()))
      })
      return cmd
    } catch {
      /* try next */
    }
  }
  return null
}

async function ensureMaven() {
  const existing = await findMaven()
  if (existing) return existing

  console.log('Maven not found — downloading Apache Maven 3.9.9…')
  const mavenHome = path.join(runtimeDir, 'maven')
  const archive = path.join(runtimeDir, 'maven.zip')
  await rm(mavenHome, { recursive: true, force: true })
  const urls = [
    'https://dlcdn.apache.org/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip',
    'https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip',
  ]
  let downloaded = false
  for (const url of urls) {
    try {
      await download(url, archive)
      downloaded = true
      break
    } catch {
      console.warn(`Mirror missed, trying next…`)
    }
  }
  if (!downloaded) throw new Error('Failed to download Maven')
  const extractTo = path.join(runtimeDir, 'maven-extract')
  await rm(extractTo, { recursive: true, force: true })
  await extractArchive(archive, extractTo)
  const entries = await readdir(extractTo, { withFileTypes: true })
  const dir = entries.find((e) => e.isDirectory())?.name
  if (!dir) throw new Error('Maven archive layout unexpected')
  await rm(mavenHome, { recursive: true, force: true })
  await run(
    process.platform === 'win32' ? 'powershell.exe' : 'mv',
    process.platform === 'win32'
      ? [
          '-NoProfile',
          '-Command',
          `Move-Item -Path '${path.join(extractTo, dir).replace(/'/g, "''")}' -Destination '${mavenHome.replace(/'/g, "''")}' -Force`,
        ]
      : [path.join(extractTo, dir), mavenHome],
  )
  await rm(extractTo, { recursive: true, force: true })
  await rm(archive, { force: true })
  const bin = path.join(
    mavenHome,
    'bin',
    process.platform === 'win32' ? 'mvn.cmd' : 'mvn',
  )
  if (!(await exists(bin))) throw new Error(`Maven binary missing at ${bin}`)
  console.log(`Installed Maven at ${mavenHome}`)
  return bin
}

async function buildJar(javaHome, mvnBin) {
  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
  }
  console.log('Building mpp-convert.jar…')
  await run(mvnBin, ['-q', '-f', path.join(javaDir, 'pom.xml'), 'package'], {
    env,
    shell: process.platform === 'win32',
  })
  const jar = path.join(javaDir, 'target', 'mpp-convert.jar')
  const st = await stat(jar)
  console.log(`OK: ${jar} (${Math.round(st.size / 1024 / 1024)} MB)`)
}

async function resolveJavaHome(javaBin) {
  if (path.isAbsolute(javaBin) || javaBin.includes(path.sep) || javaBin.includes('/')) {
    return path.resolve(path.dirname(path.dirname(javaBin)))
  }
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME
  if (await exists(jdkDir)) return jdkDir
  throw new Error(
    'Set JAVA_HOME to a JDK 17+ install (required for Maven), then re-run npm run mpp:setup',
  )
}

async function main() {
  const jdk = await ensureJdk()
  const javaHome = await resolveJavaHome(jdk.bin)
  const mvn = await ensureMaven()
  await buildJar(javaHome, mvn)
  console.log('\nMPP converter ready. Restart `npm run server` / `npm run dev`.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
