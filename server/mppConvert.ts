import { spawn } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { ensureJavaBin } from './ensureJava.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function convertWithMppjs(inputPath: string, outputPath: string): Promise<void> {
  // Optional fallback for local/dev when JAR is missing. Not shipped in the
  // Electron installer (native binary is ~60MB+ and duplicates the JAR path).
  const mod = await import('@byteink/mppjs')
  await mod.convert(inputPath, outputPath)
}

function resolveJarPath(): string {
  return (
    process.env.SUPERGANNT_JAR?.trim() ||
    path.join(__dirname, 'java', 'target', 'mpp-convert.jar')
  )
}

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

/** Find Java 17+ on the machine, or download Temurin JRE into the runtime folder. */
async function resolveJavaBin(): Promise<string | null> {
  try {
    return await ensureJavaBin()
  } catch (error) {
    console.error('[mpp] ensureJava failed:', error)
    return null
  }
}

export async function getMppEngineStatus(): Promise<{
  engine: string
  java: boolean
  jar: boolean
  mppWrite: boolean
}> {
  const javaBin = await resolveJavaBin()
  const hasJar = await fileExists(resolveJarPath())
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

function resolveTemplatePath(): string | undefined {
  return (
    process.env.SUPERGANNT_MPP_TEMPLATE?.trim() ||
    path.join(__dirname, 'java', 'templates', 'blank.mpp')
  )
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs = 180_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SUPERGANNT_MPP_TEMPLATE:
          process.env.SUPERGANNT_MPP_TEMPLATE?.trim() || resolveTemplatePath() || '',
      },
    })
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

async function requireJavaJar(): Promise<{ javaBin: string; jarPath: string }> {
  const javaBin = await resolveJavaBin()
  const jarPath = resolveJarPath()
  if (!javaBin || !(await fileExists(jarPath))) {
    throw new Error(
      `MPP engine missing. Need Java 17+ and mpp-convert.jar. ` +
        `Run: npm run mpp:setup (or wait for auto JRE download on first launch).`,
    )
  }
  return { javaBin, jarPath }
}

async function convertWithJavaToXml(
  javaBin: string,
  jarPath: string,
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await runProcess(javaBin, ['-jar', jarPath, 'to-xml', inputPath, outputPath])
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
  const jarPath = resolveJarPath()

  try {
    await writeFile(inputPath, bytes)
    const javaBin = await resolveJavaBin()
    const hasJar = await fileExists(jarPath)

    if (javaBin && hasJar) {
      await convertWithJavaToXml(javaBin, jarPath, inputPath, outputPath)
      return await readFile(outputPath, 'utf8')
    }

    try {
      await convertWithMppjs(inputPath, outputPath)
      return await readFile(outputPath, 'utf8')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isAwtCrash(message) && javaBin && hasJar) {
        await convertWithJavaToXml(javaBin, jarPath, inputPath, outputPath)
        return await readFile(outputPath, 'utf8')
      }
      if (isAwtCrash(message)) {
        throw new Error(
          'MPP conversion failed: the native MPXJ binary crashed loading AWT ' +
            '(Gantt view colors). Java 17+ will be downloaded automatically on next try, ' +
            'or run `npm run mpp:setup`. Details: ' +
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
  const { javaBin, jarPath } = await requireJavaJar()
  const workDir = path.join(tmpdir(), `supergannt-mpp-write-${randomUUID()}`)
  await mkdir(workDir, { recursive: true })
  const safeBase =
    path.basename(originalName).replace(/[^\w.\-]+/g, '_').replace(/\.mpp$/i, '') ||
    'project'
  const inputPath = path.join(workDir, `${safeBase}.xml`)
  const outputPath = path.join(workDir, `${safeBase}.mpp`)

  try {
    await writeFile(inputPath, xml, 'utf8')
    await runProcess(javaBin, ['-jar', jarPath, 'to-mpp', inputPath, outputPath])
    return await readFile(outputPath)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
