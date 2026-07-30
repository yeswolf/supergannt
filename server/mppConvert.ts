import { spawn } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { convert as convertMppjs } from '@byteink/mppjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const JAR_PATH = path.join(__dirname, 'java', 'target', 'mpp-convert.jar')
const RUNTIME_JAVA = path.join(
  __dirname,
  '.runtime',
  'jdk',
  'bin',
  process.platform === 'win32' ? 'java.exe' : 'java',
)

function isAwtCrash(message: string): boolean {
  return /UnsatisfiedLinkError|No awt|java\.awt\.Color|awt in java\.library\.path/i.test(
    message,
  )
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function resolveJavaBin(): Promise<string | null> {
  const candidates = [
    process.env.SUPERGANNT_JAVA,
    process.env.JAVA_HOME
      ? path.join(
          process.env.JAVA_HOME,
          'bin',
          process.platform === 'win32' ? 'java.exe' : 'java',
        )
      : null,
    RUNTIME_JAVA,
    'java',
  ].filter(Boolean) as string[]

  for (const bin of candidates) {
    const version = await readJavaVersion(bin)
    if (version != null && version >= 17) return bin
  }
  return null
}

export async function getMppEngineStatus(): Promise<{
  engine: string
  java: boolean
  jar: boolean
  mppWrite: boolean
}> {
  const javaBin = await resolveJavaBin()
  const hasJar = await fileExists(JAR_PATH)
  const ready = Boolean(javaBin && hasJar)
  return {
    engine: ready
      ? 'mpxj-read + ole-template-write'
      : '@byteink/mppjs (native; may crash on AWT; no mpp write)',
    java: Boolean(javaBin),
    jar: hasJar,
    mppWrite: ready,
  }
}

function readJavaVersion(bin: string): Promise<number | null> {
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
      const m = /version\s+"(\d+)(?:\.\d+)?/i.exec(err)
      if (!m) {
        resolve(null)
        return
      }
      resolve(Number(m[1]))
    })
  })
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs = 180_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (c) => {
      stderr += c.toString('utf8')
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Timed out: ${command}`))
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${command} exited ${code}: ${stderr.trim() || 'no stderr'}`))
    })
  })
}

async function requireJavaJar(): Promise<string> {
  const javaBin = await resolveJavaBin()
  if (!javaBin || !(await fileExists(JAR_PATH))) {
    throw new Error(
      `MPP engine missing. Run: npm run mpp:setup (JDK 17+ + mpp-convert.jar)`,
    )
  }
  return javaBin
}

async function convertWithJavaToXml(
  javaBin: string,
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await runProcess(javaBin, ['-jar', JAR_PATH, 'to-xml', inputPath, outputPath])
}

async function convertWithMppjs(inputPath: string, outputPath: string): Promise<void> {
  await convertMppjs(inputPath, outputPath)
}

/**
 * Server-side .mpp → MSPDI XML.
 * Prefers JDK JAR (skips presentation/AWT); falls back to @byteink/mppjs.
 */
export async function convertMppBufferToXml(
  bytes: Buffer,
  originalName: string,
): Promise<string> {
  const workDir = path.join(tmpdir(), `supergannt-mpp-${randomUUID()}`)
  await mkdir(workDir, { recursive: true })
  const safeBase =
    path.basename(originalName).replace(/[^\w.\-]+/g, '_') || 'project.mpp'
  const inputPath = path.join(
    workDir,
    safeBase.endsWith('.mpp') || safeBase.endsWith('.mpt')
      ? safeBase
      : `${safeBase}.mpp`,
  )
  const outputPath = path.join(workDir, `${safeBase}.xml`)

  try {
    await writeFile(inputPath, bytes)
    const javaBin = await resolveJavaBin()
    const hasJar = await fileExists(JAR_PATH)

    if (javaBin && hasJar) {
      await convertWithJavaToXml(javaBin, inputPath, outputPath)
      return await readFile(outputPath, 'utf8')
    }

    try {
      await convertWithMppjs(inputPath, outputPath)
      return await readFile(outputPath, 'utf8')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isAwtCrash(message) && javaBin && hasJar) {
        await convertWithJavaToXml(javaBin, inputPath, outputPath)
        return await readFile(outputPath, 'utf8')
      }
      if (isAwtCrash(message)) {
        throw new Error(
          'MPP conversion failed: the native MPXJ binary crashed loading AWT ' +
            '(Gantt view colors). Fix: install JDK 17+, then run `npm run mpp:setup`, ' +
            'and restart the API. Details: ' +
            message,
        )
      }
      throw error
    }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

/**
 * MSPDI XML → binary Microsoft Project .mpp (OLE template writer via JAR).
 */
export async function convertXmlToMppBuffer(
  xml: string,
  originalName = 'project.xml',
): Promise<Buffer> {
  const javaBin = await requireJavaJar()
  const workDir = path.join(tmpdir(), `supergannt-mpp-write-${randomUUID()}`)
  await mkdir(workDir, { recursive: true })
  const safeBase =
    path.basename(originalName).replace(/[^\w.\-]+/g, '_').replace(/\.mpp$/i, '') ||
    'project'
  const inputPath = path.join(workDir, `${safeBase}.xml`)
  const outputPath = path.join(workDir, `${safeBase}.mpp`)

  try {
    await writeFile(inputPath, xml, 'utf8')
    await runProcess(javaBin, ['-jar', JAR_PATH, 'to-mpp', inputPath, outputPath])
    return await readFile(outputPath)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
