/**
 * Re-download the 10 real MPP fixtures used by integration tests.
 * Run: node scripts/fetch-mpp-fixtures.mjs
 */
import { mkdir, rm, copyFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dest = path.join(root, 'testdata', 'mpp')
const work = path.join(dest, '_download')

const OREILLY_ZIP =
  'https://resources.oreilly.com/examples/9780735669116-files/-/archive/master/9780735669116-files-master.zip'
const MPXJ_SAMPLE =
  'https://github.com/joniles/mpxj/files/10878953/Sample.mpp.zip'

const PICKS = [
  ['Chapter09/Advanced Tasks_Start.mpp', '01-advanced-tasks.mpp'],
  ['Chapter10/Fine Tuning Tasks_Start.mpp', '02-fine-tuning-tasks.mpp'],
  ['Chapter11/Advanced Resources_Start.mpp', '03-advanced-resources.mpp'],
  ['Chapter11/Advanced Assignments_Start.mpp', '04-advanced-assignments.mpp'],
  ['Chapter12/Advanced Plan_Start.mpp', '05-advanced-plan.mpp'],
  ['Chapter14/Advanced Tracking D_Start.mpp', '06-advanced-tracking.mpp'],
  ['Chapter16/Back on Track_Start.mpp', '07-back-on-track.mpp'],
  ['Chapter18/Advanced Reporting_Start.mpp', '08-advanced-reporting.mpp'],
  ['Chapter21/Consolidating B_Start.mpp', '09-consolidating.mpp'],
]

async function download(url, outPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(outPath, buf)
  return outPath
}

async function unzipWindows(zipPath, outDir) {
  await mkdir(outDir, { recursive: true })
  if (process.platform === 'win32') {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`,
    ])
    return
  }
  await execFileAsync('unzip', ['-o', zipPath, '-d', outDir])
}

async function main() {
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })
  await mkdir(dest, { recursive: true })

  console.log('Downloading O\'Reilly MS Project 2013 practice files…')
  const oreillyZip = path.join(work, 'oreilly.zip')
  await download(OREILLY_ZIP, oreillyZip)
  await unzipWindows(oreillyZip, path.join(work, 'oreilly'))

  const oreillyRoot = path.join(
    work,
    'oreilly',
    '9780735669116-files-master',
  )

  for (const [rel, name] of PICKS) {
    const from = path.join(oreillyRoot, rel)
    const to = path.join(dest, name)
    await copyFile(from, to)
    console.log('  ✓', name)
  }

  console.log('Downloading Project Online Sample.mpp (MPXJ #443)…')
  const sampleZip = path.join(work, 'sample.zip')
  await download(MPXJ_SAMPLE, sampleZip)
  await unzipWindows(sampleZip, path.join(work, 'mpxj'))
  await copyFile(
    path.join(work, 'mpxj', 'Sample.mpp'),
    path.join(dest, '10-project-online-sample.mpp'),
  )
  console.log('  ✓ 10-project-online-sample.mpp')

  await rm(work, { recursive: true, force: true })
  console.log('Done →', dest)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
