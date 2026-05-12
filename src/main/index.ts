// Electron main entry. Creates the window, wires IPC to the engine and sessions.
// MIDI is handled in the renderer via Web MIDI API — no native module needed.

import { app, BrowserWindow, ipcMain, shell, session as electronSession } from 'electron'
import { join } from 'path'
import type { EngineState, OscErrorEvent, OscEvent, Session } from '@shared/types'
import { SceneEngine } from './engine'
import * as sessionIO from './session'
import * as autosave from './autosave'
import { OscNetworkListener } from './oscNetwork'

let mainWindow: BrowserWindow | null = null
const engine = new SceneEngine()
// Passive OSC discovery listener. Bound lazily — stays closed until
// the renderer's Pool drawer Network tab flips it on, so we don't fight
// other apps for port 9000 unless the user actually asked for it.
const networkListener = new OscNetworkListener()
// Hoisted here (rather than inside whenReady()) so the module-level
// before-quit / window-all-closed handlers can clear it alongside the
// rest of the shutdown work. Previously there were TWO before-quit
// handlers and the one that cleared this timer ran in isolation from
// the one that stopped the engine + autosave — so shutdown sequencing
// depended on registration order and ran stopAutosave twice.
let oscFlushTimer: ReturnType<typeof setInterval> | null = null
// Whether the previous run exited uncleanly. Detected when the autosave
// sentinel file still exists at startup; surfaced to the renderer on demand
// via the `session:crashCheck` IPC so it can offer a "Restore?" prompt.
let prevRunCrashed = false

/**
 * Single shutdown path. Safe to call twice (before-quit + window-all-closed
 * can both fire depending on platform / how the user exited), so every step
 * is idempotent. The old two-handler arrangement ran autosave.stopAutosave
 * twice on a normal quit — which wrote the .running sentinel-file unlink
 * twice and fired a final autosave snapshot twice.
 */
let shutdownComplete = false
function shutdown(): void {
  if (shutdownComplete) return
  shutdownComplete = true
  if (oscFlushTimer) {
    clearInterval(oscFlushTimer)
    oscFlushTimer = null
  }
  // Tear down the discovery listener so its UDP socket is released
  // before the process exits. Fire-and-forget — setEnabled(false)
  // returns a Promise but app shutdown can't wait on it.
  networkListener.setEnabled(false).catch(() => {
    /* ignore — already torn down */
  })
  engine.stop()
  autosave.stopAutosave()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#1d1d1d',
    autoHideMenuBar: true,
    title: 'dataFLOU_compositor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Allow Web MIDI in the renderer.
  electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    if (permission === 'midi' || permission === 'midiSysex') return cb(true)
    cb(false)
  })

  await engine.start()

  // Autosave + crash detection. startAutosave() writes the sentinel file and
  // schedules the 60s save loop; we stash `crashed` for the renderer to read.
  prevRunCrashed = autosave.startAutosave().crashed

  engine.setOnStateChange((s: EngineState) => {
    mainWindow?.webContents.send('engine:state', s)
  })

  // OSC monitor — batch outgoing sends and flush every 50ms to the renderer.
  // Guards against IPC floods (120 Hz × many cells). A hard cap keeps us safe
  // when a burst overflows one flush window; overflow is dropped with a
  // one-off warning per flush to keep the UI responsive.
  let oscBuffer: OscEvent[] = []
  let oscErrBuffer: OscErrorEvent[] = []
  const OSC_BUFFER_MAX = 2000
  engine.setOnOscSend((e) => {
    if (oscBuffer.length < OSC_BUFFER_MAX) oscBuffer.push(e)
  })
  engine.setOnOscError((e) => {
    // Much lower cap on errors — if something is pathologically wrong
    // (destination down, UDP socket thrashing) we don't need to flood
    // the renderer with thousands of identical entries. Rate-limit in
    // osc.ts already throttles the console log; cap here is a safety
    // net for the IPC channel.
    if (oscErrBuffer.length < 256) oscErrBuffer.push(e)
  })
  oscFlushTimer = setInterval(() => {
    if (oscBuffer.length > 0) {
      const batch = oscBuffer
      oscBuffer = []
      mainWindow?.webContents.send('engine:oscEvents', batch)
    }
    if (oscErrBuffer.length > 0) {
      const errBatch = oscErrBuffer
      oscErrBuffer = []
      mainWindow?.webContents.send('engine:oscErrors', errBatch)
    }
    // Piggy-back the discovery flush on the same timer so the Network
    // tab gets fresh device updates at ~20Hz without a second loop.
    // `flush()` is a no-op when nothing changed since the last call.
    networkListener.flush()
  }, 50)

  // Push channel — the listener calls this whenever the device map
  // changes. flush() routes through here on its 50ms cadence.
  networkListener.setOnUpdate((payload) => {
    mainWindow?.webContents.send('network:devices', payload)
  })

  // Wrapper that catches thrown errors inside an IPC handler, logs
  // them with the channel name, and returns undefined to the renderer
  // instead of propagating a generic IPC failure. Without this, a
  // malformed session payload or an engine bug could leave engine
  // state half-mutated AND surface as an unhelpful "An object could
  // not be cloned" error on the renderer side.
  function safeHandle(
    channel: string,
    handler: (...args: unknown[]) => unknown
  ): void {
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await handler(event, ...args)
      } catch (e) {
        console.error(`[ipc] ${channel} threw:`, (e as Error).message)
        return undefined
      }
    })
  }

  // ---------- IPC: Engine ----------
  safeHandle('engine:triggerCell', (_e, sceneId, trackId) =>
    engine.triggerCell(sceneId as string, trackId as string)
  )
  safeHandle('engine:stopCell', (_e, sceneId, trackId) =>
    engine.stopCell(sceneId as string, trackId as string)
  )
  safeHandle('engine:triggerScene', (_e, sceneId, opts) =>
    engine.triggerScene(
      sceneId as string,
      opts as { morphMs?: number; sourceSlotIdx?: number | null } | undefined
    )
  )
  safeHandle('engine:stopScene', (_e, sceneId) => engine.stopScene(sceneId as string))
  safeHandle('engine:stopAll', () => engine.stopAll())
  safeHandle('engine:panic', () => engine.panic())
  safeHandle('engine:pauseSequence', () => engine.pauseSequence())
  safeHandle('engine:resumeSequence', () => engine.resumeSequence())
  safeHandle('engine:setTickRate', (_e, hz) => engine.setTickRate(hz as number))
  safeHandle('engine:updateSession', (_e, s) => {
    // Snapshot to autosave FIRST so even if the engine bails partway
    // through propagating defaults, the next 60s tick captures the
    // renderer's intent. Engine call comes second.
    autosave.setCurrentSession(s as Session)
    engine.updateSession(s as Session)
  })
  safeHandle('engine:sendMetaValue', (_e, knobIdx, v) =>
    engine.sendMetaValue(knobIdx as number, v as number)
  )

  // ---------- IPC: Session I/O ----------
  // Save/open paths DO want to propagate errors back to the renderer
  // so the user sees "could not save" instead of a silent no-op. We
  // still wrap with safeHandle but rethrow inside — Electron's handle
  // promise rejection mechanism still forwards the error message.
  ipcMain.handle('session:saveAs', (_e, s: Session) => sessionIO.saveAs(mainWindow, s))
  ipcMain.handle('session:saveTo', (_e, s: Session, path: string) => sessionIO.saveTo(path, s))
  ipcMain.handle('session:open', () => sessionIO.open(mainWindow))

  // ---------- IPC: Network discovery ----------
  // Pool drawer's Network tab uses these to bind/unbind the passive
  // listener, fetch the initial device snapshot, and clear the cache.
  safeHandle('network:setEnabled', (_e, enabled, port) =>
    networkListener.setEnabled(enabled as boolean, port as number | undefined)
  )
  safeHandle('network:list', () => ({
    status: networkListener.getStatus(),
    devices: networkListener.list()
  }))
  safeHandle('network:clear', () => networkListener.clear())

  // ---------- IPC: Autosave / crash recovery ----------
  // `crashCheck` — renderer calls this on mount to decide whether to show
  // the restore prompt. Returns the flag + the latest autosave entries.
  safeHandle('autosave:crashCheck', async () => {
    const entries = await autosave.listAutosaves()
    return { crashed: prevRunCrashed, entries }
  })
  safeHandle('autosave:list', () => autosave.listAutosaves())
  // Load DOES want to propagate failures (so the user sees the parse
  // error in the integrity dialog). Leave it on the raw ipcMain.handle.
  ipcMain.handle('autosave:load', (_e, path: string) => autosave.loadAutosave(path))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  shutdown()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', shutdown)
