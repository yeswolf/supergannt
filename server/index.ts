import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { convertMppBufferToXml, convertXmlToMppBuffer } from './mppConvert.ts'

const port = Number(process.env.PORT ?? 8787)
const isProd = process.env.NODE_ENV === 'production'

const app = new Hono()

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

if (isProd) {
  app.use('/assets/*', serveStatic({ root: './dist' }))
  app.get('/favicon.svg', serveStatic({ root: './dist', path: './favicon.svg' }))
  app.get('/', serveStatic({ root: './dist', path: './index.html' }))
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next()
    return serveStatic({ root: './dist', path: './index.html' })(c, next)
  })
}

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`SuperGantt listening on http://localhost:${info.port}`)
  console.log('MPP: POST /api/mpp/to-xml  (read)  /api/mpp/from-xml (write → OLE .mpp)')
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    void fetch(`http://127.0.0.1:${port}/api/health`)
      .then((res) => {
        if (res.ok) {
          console.log(`Port ${port} already has SuperGantt API — reusing it.`)
          process.exit(0)
        }
        console.error(`Port ${port} is in use by something else. Free it and retry.`)
        process.exit(1)
      })
      .catch(() => {
        console.error(`Port ${port} is already in use. Free it and retry.`)
        process.exit(1)
      })
    return
  }
  throw error
})
