/**
 * Capture README screenshots from a real .mpp fixture.
 * Needs API on :8787 (vite preview proxies /api) and:
 *   npm i -D playwright-core --legacy-peer-deps
 *
 * Before shots: strips "Editorial staff meeting*" tasks from a temp copy of the MPP
 * (keeps testdata fixtures intact).
 *
 * Usage:
 *   node scripts/capture-readme-shots.mjs
 *   SUPERGANNT_SHOT_MPP=path/to/file.mpp node scripts/capture-readme-shots.mjs
 */
import { accessSync, constants as fsConstants } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'docs', 'screenshots')
const base = process.env.SUPERGANNT_SHOT_URL ?? 'http://127.0.0.1:4173/'
const mppPath =
  process.env.SUPERGANNT_SHOT_MPP ??
  path.join(root, 'testdata', 'mpp', '06-advanced-tracking.mpp')

/** Recurring meeting spam in the Advanced Tracking sample — hide from README shots. */
const DROP_TASK_NAME = /^Editorial staff meeting(?:\s+\d+)?$/i

function findEdge() {
  for (const p of [
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)) {
    try {
      accessSync(p, fsConstants.F_OK)
      return p
    } catch {
      /* next */
    }
  }
  return null
}

function findJava() {
  const bundled = path.join(root, 'server', '.runtime', 'jdk', 'bin', 'java.exe')
  try {
    accessSync(bundled, fsConstants.F_OK)
    return bundled
  } catch {
    return process.platform === 'win32' ? 'java.exe' : 'java'
  }
}

/**
 * Build a temp MSPDI XML without Editorial staff meeting* tasks.
 * (Round-trip via to-mpp would resurrect them from blank.mpp template.)
 * @returns {{ filePath: string, removed: number, cleanup: () => Promise<void> }}
 */
async function prepareShotPlan(sourceMpp) {
  const jar = path.join(root, 'server', 'java', 'target', 'mpp-convert.jar')
  accessSync(jar, fsConstants.F_OK)

  const work = await mkdtemp(path.join(tmpdir(), 'supergannt-shots-'))
  const xmlIn = path.join(work, 'in.xml')
  const xmlOut = path.join(work, 'shot.xml')
  const java = findJava()

  await execFileAsync(java, ['-jar', jar, 'to-xml', sourceMpp, xmlIn], {
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  })

  let xml = await readFile(xmlIn, 'utf8')
  const dropUids = new Set()
  xml = xml.replace(/<Task>[\s\S]*?<\/Task>/g, (block) => {
    const name = block.match(/<Name>([^<]*)<\/Name>/)?.[1] ?? ''
    if (!DROP_TASK_NAME.test(name.trim())) return block
    const uid = block.match(/<UID>(\d+)<\/UID>/)?.[1]
    if (uid) dropUids.add(uid)
    return ''
  })

  if (dropUids.size === 0) {
    console.warn('No Editorial staff meeting* tasks found — using source MPP as-is')
    return {
      filePath: sourceMpp,
      removed: 0,
      cleanup: async () => {
        await rm(work, { recursive: true, force: true })
      },
    }
  }

  xml = xml.replace(/<Assignment>[\s\S]*?<\/Assignment>/g, (block) => {
    const taskUid = block.match(/<TaskUID>(\d+)<\/TaskUID>/)?.[1]
    return taskUid && dropUids.has(taskUid) ? '' : block
  })
  xml = xml.replace(/<PredecessorLink>[\s\S]*?<\/PredecessorLink>/g, (block) => {
    const pred = block.match(/<PredecessorUID>(\d+)<\/PredecessorUID>/)?.[1]
    return pred && dropUids.has(pred) ? '' : block
  })

  await writeFile(xmlOut, xml, 'utf8')
  console.log(`Removed ${dropUids.size} Editorial staff meeting* task(s) for screenshots`)
  return {
    filePath: xmlOut,
    removed: dropUids.size,
    cleanup: async () => {
      await rm(work, { recursive: true, force: true })
    },
  }
}

async function clickQuickView(page, label) {
  const chip = page.getByLabel('Quick views').getByRole('button', { name: label })
  if (await chip.count()) {
    await chip.click()
    return
  }
  await page.locator(`[title="${label}"]`).first().click()
}

async function main() {
  let chromium
  try {
    ;({ chromium } = await import('playwright-core'))
  } catch {
    throw new Error('playwright-core missing — run: npm i -D playwright-core --legacy-peer-deps')
  }

  accessSync(mppPath, fsConstants.F_OK)
  const executablePath = findEdge()
  if (!executablePath) throw new Error('Microsoft Edge not found')

  const prepared = await prepareShotPlan(mppPath)

  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--disable-gpu'],
  })
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  })

  try {
    await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForSelector('text=Gantt Chart', { timeout: 30000 })

    const input = page.locator('input[type="file"]')
    await input.setInputFiles(prepared.filePath)
    await page.waitForFunction(
      () => {
        const busy = document.body.innerText.includes('Opening')
        const opened = /Opened .+\.(mpp|xml|mspdi)/i.test(document.body.innerText)
        const err = /Failed to open|error/i.test(document.body.innerText)
        return (!busy && opened) || err
      },
      { timeout: 120000 },
    )
    const status = await page.locator('body').innerText()
    if (
      /Failed to open|Only \.mpp/i.test(status) &&
      !/Opened .+\.(mpp|xml|mspdi)/i.test(status)
    ) {
      throw new Error(`Plan open failed. Status text snippet:\n${status.slice(-500)}`)
    }
    await page.waitForTimeout(2000)

    // Sanity: meeting spam must not appear on screen.
    const leftover = await page.getByText(/Editorial staff meeting/i).count()
    if (leftover > 0) {
      throw new Error(`Editorial staff meeting still visible (${leftover} match(es))`)
    }

    async function shot(name, prepare) {
      if (prepare) await prepare()
      await page.waitForTimeout(900)
      const file = path.join(outDir, `${name}.png`)
      await page.screenshot({ path: file, fullPage: false })
      console.log('wrote', path.basename(file))
    }

    await shot('01-gantt', async () => {
      await clickQuickView(page, 'Gantt Chart')
      const week = page.getByRole('button', { name: 'Week', exact: true })
      if (await week.count()) await week.click()
      await page.waitForTimeout(500)
    })

    await shot('02-gantt-month', async () => {
      const month = page.getByRole('button', { name: 'Month', exact: true })
      if (await month.count()) await month.click()
      await page.waitForTimeout(500)
    })

    await shot('03-tasks', async () => {
      await clickQuickView(page, 'Task Sheet')
    })

    await shot('04-resources', async () => {
      await clickQuickView(page, 'Resource Sheet')
    })

    await shot('05-network', async () => {
      await clickQuickView(page, 'Network Diagram')
      await page.waitForTimeout(1500)
    })

    await shot('06-wbs', async () => {
      await clickQuickView(page, 'WBS')
    })

    await shot('07-task-usage', async () => {
      await clickQuickView(page, 'Task Usage')
    })

    await shot('08-resource-usage', async () => {
      await clickQuickView(page, 'Resource Usage')
    })

    await shot('09-calendar', async () => {
      await clickQuickView(page, 'Calendar')
    })

    await shot('10-reports', async () => {
      await clickQuickView(page, 'Reports')
    })
  } finally {
    await browser.close()
    await prepared.cleanup()
  }

  console.log(`done — source ${mppPath} (removed ${prepared.removed} meeting task(s))`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
