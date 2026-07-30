import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { convertMppBufferToXml, convertXmlToMppBuffer } from './mppConvert.ts'

const port = Number(process.env.PORT ?? 8787)
const isProd = process.env.NODE_ENV === 'production'
const staticRootEnv = process.env.SUPERGANNT_STATIC_ROOT?.trim()
/** Serve UI when packaged (STATIC_ROOT) or NODE_ENV=production (./dist). */
const serveUi = Boolean(staticRootEnv || isProd)
/** Absolute UI root — relative paths resolve from process cwd (resources/ in Electron). */
const staticRoot = path.resolve(staticRootEnv || './dist')
const indexHtmlPath = path.join(staticRoot, 'index.html')

const app = new Hono()

function serveIndexHtml(c: {
  html: (html: string) => Response | Promise<Response>
  text: (text: string, status?: number) => Response | Promise<Response>
}) {
  if (!existsSync(indexHtmlPath)) {
    return c.text(`SuperGantt UI not found at ${indexHtmlPath}`, 404)
  }
  return c.html(readFileSync(indexHtmlPath, 'utf8'))
}

app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
)

app.get('/api/health', async (c) => {
  const { getMppEngineStatus } = await import('./mppConvert.ts')
  return c.json({
    ok: true,
    mpp: true,
    ...(await getMppEngineStatus()),
  })
})

app.post('/api/mpp/to-xml', async (c) => {
  try {
    const body = await c.req.parseBody({ all: true })
    const file = body['file']
    if (!(file instanceof File)) {
      return c.json({ error: 'Expected multipart field "file" with an .mpp upload' }, 400)
    }
    const name = file.name || 'project.mpp'
    if (!/\.(mpp|mpt)$/i.test(name)) {
      return c.json({ error: 'Only .mpp / .mpt files are accepted' }, 400)
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.byteLength === 0) {
      return c.json({ error: 'Empty file' }, 400)
    }
    const xml = await convertMppBufferToXml(bytes, name)
    return c.body(xml, 200, {
      'Content-Type': 'application/xml; charset=utf-8',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MPP conversion failed'
    console.error('[mpp]', message)
    return c.json({ error: message }, 500)
  }
})

app.post('/api/mpp/from-xml', async (c) => {
  try {
    const body = await c.req.parseBody({ all: true })
    const file = body['file']
    if (!(file instanceof File)) {
      return c.json({ error: 'Expected multipart field "file" with MSPDI XML' }, 400)
    }
    const name = file.name || 'project.xml'
    const xml = await file.text()
    if (!xml.trim()) {
      return c.json({ error: 'Empty XML' }, 400)
    }
    const mpp = await convertXmlToMppBuffer(xml, name)
    return c.body(mpp, 200, {
      'Content-Type': 'application/vnd.ms-project',
      'Content-Disposition': `attachment; filename="${name.replace(/\.xml$/i, '')}.mpp"`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MPP write failed'
    console.error('[mpp-write]', message)
    return c.json({ error: message }, 500)
  }
})

if (serveUi) {
  if (!existsSync(indexHtmlPath)) {
    console.error(`SUPERGANNT_STATIC_ROOT=${staticRoot} — missing index.html`)
  }
  // Strip leading `/` so path.join(root, reqPath) cannot discard an absolute root on POSIX.
  const fromRoot = (p: string) => p.replace(/^\//, '')
  app.use(
    '/assets/*',
    serveStatic({ root: staticRoot, rewriteRequestPath: fromRoot }),
  )
  app.get('/favicon.svg', serveStatic({ root: staticRoot, path: 'favicon.svg' }))
  app.get('/icons.svg', serveStatic({ root: staticRoot, path: 'icons.svg' }))
  // SPA: read index.html directly — serveStatic's on-miss next() became a bare 404 in Electron.
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next()
    return serveIndexHtml(c)
  })
}

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`SuperGantt listening on http://localhost:${info.port}`)
  if (serveUi) console.log(`UI static root: ${staticRoot}`)
  console.log('MPP: POST /api/mpp/to-xml  (read)  /api/mpp/from-xml (write → OLE .mpp)')
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    void (async () => {
      try {
        const health = await fetch(`http://127.0.0.1:${port}/api/health`)
        if (!health.ok) {
          console.error(`Port ${port} is in use by something else. Free it and retry.`)
          process.exit(1)
        }
        // Do not "reuse" a health-only API (e.g. `npm run server`) — that yields UI 404 in Electron.
        if (serveUi) {
          const ui = await fetch(`http://127.0.0.1:${port}/`)
          const ct = ui.headers.get('content-type') ?? ''
          if (!ui.ok || !ct.includes('text/html')) {
            console.error(
              `Port ${port} has SuperGantt API without UI. Stop that process and retry.`,
            )
            process.exit(1)
          }
        }
        console.log(`Port ${port} already has SuperGantt — reusing it.`)
        process.exit(0)
      } catch {
        console.error(`Port ${port} is already in use. Free it and retry.`)
        process.exit(1)
      }
    })()
    return
  }
  throw error
})
