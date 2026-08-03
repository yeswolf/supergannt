/**
 * Quick mouse FS link drag (no long-press) — must work on desktop.
 */
import { chromium } from 'playwright'

const BASE = process.env.SUPERGANNT_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('[aria-label="Gantt chart"]', { timeout: 20000 })
await page.waitForFunction(() => Boolean(window.gantt?.getTaskByTime), { timeout: 10000 })

const cfg = await page.evaluate(() => ({
  touch: window.gantt.config.touch,
  touch_drag: window.gantt.config.touch_drag,
}))
console.log('CONFIG', cfg)

const add = page.getByRole('button', { name: 'Add task' })
await add.click()
await page.waitForTimeout(200)
await add.click()
await page.waitForTimeout(800)

async function pointFor(taskIndex, side) {
  const bar = page.locator('.gantt_task_line').nth(taskIndex)
  await bar.hover()
  await page.waitForTimeout(80)
  return page.evaluate(
    ({ index, side }) => {
      const g = window.gantt
      const t = g.getTaskByTime()[index]
      const node = g.getTaskNode(t.id)
      const sel =
        side === 'right'
          ? '.gantt_link_control.task_right .gantt_link_point'
          : '.gantt_link_control.task_left .gantt_link_point'
      const el = node.querySelector(sel)
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }
    },
    { index: taskIndex, side },
  )
}

// Measure both while visible (hover shows points); keep coordinates
const from = await pointFor(0, 'right')
const to = await pointFor(1, 'left')
// Re-show A's point and drag immediately (no 750ms hold)
await page.locator('.gantt_task_line').nth(0).hover()
await page.waitForTimeout(50)
console.log('FROM', from, 'TO', to)

await page.mouse.move(from.x, from.y)
await page.mouse.down()
await page.mouse.move(to.x, to.y, { steps: 25 })
await page.mouse.up()
await page.waitForTimeout(1200)

const after = await page.evaluate(() => {
  const g = window.gantt
  return {
    starts: g.getTaskByTime().map((t) => t.start_date.toISOString()),
    links: g.getLinks().length,
    status: document.querySelector('[role="status"]')?.textContent ?? null,
  }
})
console.log('AFTER', after)
const shifted =
  after.links >= 1 && Date.parse(after.starts[1]) > Date.parse(after.starts[0])
// Desktop must not stay in forced touch (750ms long-press) mode.
const ok = shifted && cfg.touch !== 'force'
console.log('RESULT', { ok, shifted, touch: cfg.touch })
await browser.close()
process.exit(ok ? 0 : 1)
