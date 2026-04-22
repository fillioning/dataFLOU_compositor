import { contextBridge, ipcRenderer } from 'electron'
import type { EngineState, ExposedApi, Session } from '@shared/types'

const api: ExposedApi = {
  triggerCell: (sceneId, trackId) => ipcRenderer.invoke('engine:triggerCell', sceneId, trackId),
  stopCell: (sceneId, trackId) => ipcRenderer.invoke('engine:stopCell', sceneId, trackId),
  triggerScene: (sceneId) => ipcRenderer.invoke('engine:triggerScene', sceneId),
  stopScene: (sceneId) => ipcRenderer.invoke('engine:stopScene', sceneId),
  stopAll: () => ipcRenderer.invoke('engine:stopAll'),
  panic: () => ipcRenderer.invoke('engine:panic'),
  pauseSequence: () => ipcRenderer.invoke('engine:pauseSequence'),
  resumeSequence: () => ipcRenderer.invoke('engine:resumeSequence'),
  setTickRate: (hz) => ipcRenderer.invoke('engine:setTickRate', hz),
  updateSession: (s: Session) => ipcRenderer.invoke('engine:updateSession', s),
  sendMetaValue: (knobIdx, v) => ipcRenderer.invoke('engine:sendMetaValue', knobIdx, v),

  sessionSaveAs: (s: Session) => ipcRenderer.invoke('session:saveAs', s),
  sessionSave: (s: Session, path: string) => ipcRenderer.invoke('session:saveTo', s, path),
  sessionOpen: () => ipcRenderer.invoke('session:open'),

  onEngineState: (cb) => {
    const h = (_e: Electron.IpcRendererEvent, s: EngineState): void => cb(s)
    ipcRenderer.on('engine:state', h)
    return () => ipcRenderer.off('engine:state', h)
  }
}

contextBridge.exposeInMainWorld('api', api)

declare global {
  interface Window {
    api: ExposedApi
  }
}
