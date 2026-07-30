/**
 * Locate a Java 17+ runtime, or download Eclipse Temurin JRE into
 * SUPERGANNT_RUNTIME_DIR (default: server/.runtime) on first use.
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

export function defaultRuntimeDir(): string {
  return (
    process.env.SUPERGANNT_RUNTIME_DIR?.trim() ||
    path.join(__dirname, '.runtime')
  )
}

function javaBinName(): string {
  return process.platform === 'win32' ? 'java.exe' : 'java'
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function readJavaVersion(bin: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-version'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    child.stderr.on('data', (c) => {
      err += c.toString('utf8')
    })
    child.stdout.on('data', (c) => {
      err += c.toString('utf8')
    })
    child.on('error', () => resolve(null))
    child.on('close', () => {
      const m = /version\s+"(\d+)/i.exec(err)
      resolve(m ? Number(m[1]) : null)
    })
  })
}

async function* walkJavaCandidates(root: string, depth = 0): AsyncGenerator<string> {
  if (depth > 4) return
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(root, e.name)
    if (e.isFile() && e.name.toLowerCase() === javaBinName().toLowerCase()) {
      yield full
    } else if (e.isDirectory()) {
      if (e.name === 'bin') {
        const bin = path.join(full, javaBinName())
        if (await exists(bin)) yield bin
      } else if (
        /jdk|jre|java|temurin|adoptium|zulu|corretto|microsoft/i.test(e.name)
      ) {
        yield* walkJavaCandidates(full, depth + 1)
      }
    }
  }
}

async function findOnPath(): Promise<string | null> {
  const cmd = javaBinName()
  return new Promise((resolve) => {
    const child = spawn(cmd, ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })
    let err = ''
    child.stderr.on('data', (c) => {
      err += c.toString('utf8')
    })
    child.stdout.on('data', (c) => {
      err += c.toString('utf8')
    })
    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
        return
      }
      const m = /version\s+"(\d+)/i.exec(err)
      resolve(m && Number(m[1]) >= 17 ? cmd : null)
    })
  })
}

async function collectCandidates(runtimeDir: string): Promise<string[]> {
  const localJdk = path.join(runtimeDir, 'jdk', 'bin', javaBinName())
  const out: string[] = []
  const ignoreSystem = process.env.SUPERGANNT_IGNORE_SYSTEM_JAVA === '1'

  const push = (p: string | null | undefined) => {
    if (p && !out.includes(p)) out.push(p)
  }

  push(process.env.SUPERGANNT_JAVA)
  if (!ignoreSystem && process.env.JAVA_HOME) {
    push(path.join(process.env.JAVA_HOME, 'bin', javaBinName()))
  }
  push(localJdk)

  if (ignoreSystem) {
    return out
  }

  const pathJava = await findOnPath()
  push(pathJava)

  const searchRoots =
    process.platform === 'win32'
      ? [
          process.env['ProgramFiles'] ?? 'C:\\Program Files',
          process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
          'C:\\Program Files\\Eclipse Adoptium',
          'C:\\Program Files\\Java',
          'C:\\Program Files\\Microsoft',
          'C:\\Program Files\\Amazon Corretto',
        ]
      : process.platform === 'darwin'
        ? ['/Library/Java/JavaVirtualMachines', '/opt/homebrew/opt']
        : ['/usr/lib/jvm', '/usr/lib64/jvm', '/opt']

  for (const root of searchRoots) {
    if (!(await exists(root))) continue
    let n = 0
    for await (const bin of walkJavaCandidates(root)) {
      push(bin)
      n += 1
      if (n >= 12) break
    }
  }

  return out
}

function adoptiumJreUrl(): string {
  const os =
    process.platform === 'win32'
      ? 'windows'
      : process.platform === 'darwin'
        ? 'mac'
        : 'linux'
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
  return `https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}/jre/hotspot/normal/eclipse?project=jdk`
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`JDK download failed ${res.status} ${url}`)
  }
  await mkdir(path.dirname(dest), { recursive: true })
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(dest))
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited ${code}`))
    })
  })
}

async function extractArchive(archive: string, dest: string): Promise<void> {
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

async function normalizeJdkLayout(extractRoot: string, jdkDir: string): Promise<void> {
  const entries = await readdir(extractRoot, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  const nested =
    dirs.length === 1 ? path.join(extractRoot, dirs[0]!) : extractRoot
  const staging = path.join(path.dirname(jdkDir), 'jdk-staging')
  await rm(staging, { recursive: true, force: true })
  await rm(jdkDir, { recursive: true, force: true })
  if (process.platform === 'win32') {
    await run('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Copy-Item -Path '${nested.replace(/'/g, "''")}' -Destination '${staging.replace(/'/g, "''")}' -Recurse -Force; Move-Item -Path '${staging.replace(/'/g, "''")}' -Destination '${jdkDir.replace(/'/g, "''")}' -Force`,
    ])
  } else {
    await run('cp', ['-a', nested, staging])
    await run('mv', [staging, jdkDir])
  }
  if (extractRoot !== nested || dirs.length === 1) {
    await rm(extractRoot, { recursive: true, force: true })
  }
}

let ensurePromise: Promise<string> | null = null

/**
 * Returns path to a java binary (17+). Downloads Temurin JRE into the
 * runtime directory when nothing usable is found on the machine.
 */
export async function ensureJavaBin(
  runtimeDir = defaultRuntimeDir(),
): Promise<string> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const candidates = await collectCandidates(runtimeDir)
      for (const bin of candidates) {
        const version = await readJavaVersion(bin)
        if (version != null && version >= 17) {
          return bin
        }
      }

      console.warn(
        '[supergannt] No Java 17+ found — downloading Eclipse Temurin 21 JRE into',
        runtimeDir,
      )
      await mkdir(runtimeDir, { recursive: true })
      const jdkDir = path.join(runtimeDir, 'jdk')
      const isWin = process.platform === 'win32'
      const archive = path.join(runtimeDir, isWin ? 'jre.zip' : 'jre.tar.gz')
      await download(adoptiumJreUrl(), archive)
      const extractTo = path.join(runtimeDir, 'jre-extract')
      await rm(extractTo, { recursive: true, force: true })
      await extractArchive(archive, extractTo)
      await normalizeJdkLayout(extractTo, jdkDir)
      await rm(archive, { force: true })

      const bin = path.join(jdkDir, 'bin', javaBinName())
      if (!(await exists(bin))) {
        throw new Error(`Downloaded JRE is missing ${bin}`)
      }
      if (!isWin) await chmod(bin, 0o755)
      const version = await readJavaVersion(bin)
      if (version == null || version < 17) {
        throw new Error('Downloaded JRE is not usable (need 17+)')
      }
      console.warn(`[supergannt] Temurin ${version} ready at ${jdkDir}`)
      return bin
    })().catch((err) => {
      ensurePromise = null
      throw err
    })
  }
  return ensurePromise
}

export async function javaHomeFromBin(javaBin: string): Promise<string> {
  if (path.isAbsolute(javaBin) || javaBin.includes(path.sep) || javaBin.includes('/')) {
    return path.resolve(path.dirname(path.dirname(javaBin)))
  }
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME
  const local = path.join(defaultRuntimeDir(), 'jdk')
  if (await exists(local)) return local
  return path.dirname(path.dirname(javaBin))
}

/** True when the runtime jdk folder looks populated. */
export async function hasBundledRuntime(runtimeDir = defaultRuntimeDir()): Promise<boolean> {
  try {
    const st = await stat(path.join(runtimeDir, 'jdk', 'bin', javaBinName()))
    return st.isFile()
  } catch {
    return false
  }
}
