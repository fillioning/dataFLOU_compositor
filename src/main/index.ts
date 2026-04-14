// Electron main entry. Creates the window, wires IPC to the engine and sessions.
// MIDI is handled in the renderer via Web MIDI API — no native module needed.

import { app, BrowserWindow, ipcMain, shell, session as electronSession } from 'electron'
import { join } from 'path'
import type { EngineState, Session } from '@shared/types'
import { SceneEngine } from './engine'
import * as sessionIO from './session'

let mainWindow: BrowserWindow | null = null
const engine = new SceneEngine()

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

  engine.setOnStateChange((s: EngineState) => {
    mainWindow?.webContents.send('engine:state', s)
  })

  // ---------- IPC: Engine ----------
  ipcMain.handle('engine:triggerCell', (_e, sceneId: string, trackId: string) => {
    engine.triggerCell(sceneId, trackId)
  })
  ipcMain.handle('engine:stopCell', (_e, sceneId: string, trackId: string) => {
    engine.stopCell(sceneId, trackId)
  })
  ipcMain.handle('engine:triggerScene', (_e, sceneId: string) => {
    engine.triggerScene(sceneId)
  })
  ipcMain.handle('engine:stopScene', (_e, sceneId: string) => {
    engine.stopScene(sceneId)
  })
  ipcMain.handle('engine:stopAll', () => engine.stopAll())
  ipcMain.handle('engine:panic', () => engine.panic())
  ipcMain.handle('engine:pauseSequence', () => engine.pauseSequence())
  ipcMain.handle('engine:resumeSequence', () => engine.resumeSequence())
  ipcMain.handle('engine:setTickRate', (_e, hz: number) => engine.setTickRate(hz))
  ipcMain.handle('engine:updateSession', (_e, s: Session) => engine.updateSession(s))

  // ---------- IPC: Session I/O ----------
  ipcMain.handle('session:saveAs', (_e, s: Session) => sessionIO.saveAs(mainWindow, s))
  ipcMain.handle('session:saveTo', (_e, s: Session, path: string) => sessionIO.saveTo(path, s))
  ipcMain.handle('session:open', () => sessionIO.open(mainWindow))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  engine.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  engine.stop()
})
