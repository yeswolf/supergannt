/**
 * Live repro: add two tasks, FS-link via dhtmlx API, assert successor start moves.
 * Usage: node scripts/e2e-gantt-link.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.SUPERGANNT_URL ?? 'http://127.0.0.1:5173'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on('console', (msg) => {
  const t = msg.text()
  if (t.includes('SuperGantt') || t.includes('link') || t.includes('Error') || t.includes('Dependency')) {
    console.log('BROWSER:', msg.type(), t)
  }
})
page.on('pageerror', (err) => console.log('PAGEERROR:', err.message))

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[aria-label="Gantt chart"]', { timeout: 20000 })
await page.waitForTimeout(1000)

// Ensure gantt singleton is exposed
await page.waitForFunction(() => Boolean(window.gantt?.getTaskByTime), { timeout: 10000 })

const add = page.getByRole('button', { name: 'Add task' })
await add.click()
await page.waitForTimeout(200)
await add.click()
await page.waitForTimeout(500)

const before = await page.evaluate(() => {
  const g = window.gantt
  const tasks = g.getTaskByTime()
  return {
    count: tasks.length,
    ids: tasks.map((t) => String(t.id)),
    starts: tasks.map((t) => ({
      id: String(t.id),
      text: t.text,
      start: t.start_date instanceof Date ? t.start_date.toISOString() : String(t.start_date),
    })),
  }
})
console.log('BEFORE', JSON.stringify(before, null, 2))

if (before.count < 2) {
  console.error('Need >=2 tasks')
  await browser.close()
  process.exit(2)
}

const [pred, succ] = before.ids
const after = await page.evaluate(async ({ pred, succ }) => {
  const g = window.gantt
  const events = []
  const hid = g.attachEvent('onAfterLinkAdd', (id, link) => {
    events.push({ phase: 'after-add', id: String(id), source: String(link.source), target: String(link.target), type: String(link.type) })
    return true
  })
  let linkId
  try {
    linkId = g.addLink({ source: pred, target: succ, type: '0' })
  } catch (e) {
    return { error: String(e), events }
  }
  await new Promise((r) => setTimeout(r, 1000))
  g.detachEvent(hid)
  const tasks = g.getTaskByTime()
  return {
    linkId: String(linkId),
    events,
    starts: tasks.map((t) => ({
      id: String(t.id),
      text: t.text,
      start: t.start_date instanceof Date ? t.start_date.toISOString() : String(t.start_date),
    })),
    links: g.getLinks().map((l) => ({
      id: String(l.id),
      source: String(l.source),
      target: String(l.target),
      type: String(l.type),
    })),
    statusText: document.body.innerText.match(/Dependency|Link|itself|failed|created|Blank|Ready|Predecessors.*/)?.[0] ?? null,
  }
}, { pred, succ })

console.log('AFTER', JSON.stringify(after, null, 2))

const predStart = Date.parse(after.starts.find((t) => t.id === pred)?.start ?? '')
const succStart = Date.parse(after.starts.find((t) => t.id === succ)?.start ?? '')
const shifted = Number.isFinite(predStart) && Number.isFinite(succStart) && succStart > predStart
console.log({ predStart, succStart, shifted })

await browser.close()
process.exit(shifted ? 0 : 1)
