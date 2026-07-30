import { app, BrowserWindow, dialog, shell } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installAppMenu } from './appMenu.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
const PREFERRED_PORT = Number(process.env.SUPERGANNT_PORT ?? 8787)

/** @type {import('node:child_process').ChildProcess | null} */
let apiProcess = null
/** @type {number | null} */
let apiExitCode = null
let activePort = PREFERRED_PORT

function resourcesRoot() {
  return isDev ? path.join(__dirname, '..') : process.resourcesPath
}

function apiUrl(port = activePort) {
  return `http://127.0.0.1:${port}`
}

/**
 * @param {number} port
 * @returns {Promise<'ready' | 'wrong' | 'busy' | 'free'>}
 */
async function probePort(port) {
  const base = apiUrl(port)
  const signal = AbortSignal.timeout(2_000)
  try {
    const health = await fetch(`${base}/api/health`, { signal })
    if (!health.ok) return 'busy'
    const ui = await fetch(`${base}/`, { signal: AbortSignal.timeout(2_000) })
    const ct = ui.headers.get('content-type') ?? ''
    if (ui.ok && ct.includes('text/html')) return 'ready'
    return 'wrong'
  } catch {
    // Connection refused, abort/timeout, or non-HTTP listener → treat as free to try bind,
    // or as not-ready when waitForApi is polling a port we own.
    return 'free'
  }
}

async function pickPort() {
  const preferred = await probePort(PREFERRED_PORT)
  if (preferred === 'ready') return { port: PREFERRED_PORT, spawn: false }
  if (preferred === 'free') return { port: PREFERRED_PORT, spawn: true }

  for (let port = PREFERRED_PORT + 1; port < PREFERRED_PORT + 30; port++) {
    if ((await probePort(port)) === 'free') return { port, spawn: true }
  }
  throw new Error(
    `Port ${PREFERRED_PORT} is in use by an API without UI (or another app), ` +
      `and no free port was found in ${PREFERRED_PORT + 1}–${PREFERRED_PORT + 29}.`,
  )
}

async function waitForApi(timeoutMs = 180_000) {
  const started = Date.now()
  let lastError = ''
  while (Date.now() - started < timeoutMs) {
    if (apiExitCode != null && apiExitCode !== 0) {
      throw new Error(
        `SuperGantt API exited before ready (code ${apiExitCode}). ` +
          (lastError ? `(${lastError}) ` : '') +
          `Is port ${activePort} already in use?`,
      )
    }
    try {
      const status = await probePort(activePort)
      if (status === 'ready') return
      lastError = status === 'wrong' ? 'UI HTTP missing/not HTML' : `probe=${status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`SuperGantt API did not start: ${lastError}`)
}

function startApiServer(port) {
  if (isDev) {
    // `npm run desktop:dev` already runs the API via concurrently.
    return
  }

  const root = resourcesRoot()
  const serverEntry = path.join(root, 'server', 'index.mjs')
  const uiRoot = path.join(root, 'ui')
  const jar = path.join(root, 'mpp', 'mpp-convert.jar')
  const template = path.join(root, 'mpp', 'blank.mpp')
  const runtimeDir = path.join(app.getPath('userData'), 'runtime')

  apiExitCode = null
  apiProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      SUPERGANNT_STATIC_ROOT: uiRoot,
      SUPERGANNT_JAR: jar,
      SUPERGANNT_MPP_TEMPLATE: template,
      SUPERGANNT_RUNTIME_DIR: runtimeDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: root,
  })

  apiProcess.stdout?.on('data', (chunk) => {
    console.log(`[api] ${String(chunk).trimEnd()}`)
  })
  apiProcess.stderr?.on('data', (chunk) => {
    console.error(`[api] ${String(chunk).trimEnd()}`)
  })
  apiProcess.on('exit', (code, signal) => {
    apiExitCode = code
    console.error(`[api] exited code=${code} signal=${signal}`)
    apiProcess = null
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'SuperGantt',
    backgroundColor: '#0f6cbd',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173')
  } else {
    void win.loadURL(apiUrl())
  }
}

async function boot() {
  try {
    if (!isDev) {
      const choice = await pickPort()
      activePort = choice.port
      if (choice.spawn) startApiServer(activePort)
      await waitForApi()
    }
    createWindow()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('SuperGantt failed to start', message)
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.whenReady().then(() => {
  installAppMenu({ isDev })
  void boot()
})

app.on('window-all-closed', () => {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill()
    apiProcess = null
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill()
    apiProcess = null
  }
})
