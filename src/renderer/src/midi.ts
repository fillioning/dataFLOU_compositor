// Web MIDI integration. Runs entirely in the renderer.
//
// Responsibilities:
//  - Request MIDI access once on app start
//  - Enumerate & track connected inputs (react to devices added/removed)
//  - Route incoming messages: either feed a pending "learn" resolver OR
//    match against track/scene bindings and fire IPC triggers via window.api
//  - Simple pub-sub so components can re-render when device list changes

import type { MidiBinding } from '@shared/types'
import { useStore } from './store'

export interface MidiDevice {
  id: string
  name: string
}

type LearnResolver = (b: MidiBinding) => void

class MidiManager {
  private access: MIDIAccess | null = null
  private openedId: string | null = null
  private learnCb: LearnResolver | null = null
  private listeners = new Set<(devs: MidiDevice[]) => void>()

  async init(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) {
      console.warn('[MIDI] Web MIDI not available')
      return false
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
    } catch (e) {
      console.warn('[MIDI] access denied', e)
      return false
    }
    this.access.onstatechange = (): void => this.notifyListeners()
    // Re-open persisted device if name matches.
    const prev = useStore.getState().session.midiInputName
    if (prev) this.open(prev)
    this.notifyListeners()
    return true
  }

  listDevices(): MidiDevice[] {
    if (!this.access) return []
    const out: MidiDevice[] = []
    this.access.inputs.forEach((input) => {
      out.push({ id: input.id, name: input.name ?? input.id })
    })
    return out
  }

  open(name: string | null): boolean {
    if (!this.access) return false
    // Close previously opened.
    this.access.inputs.forEach((inp) => {
      if (inp.id === this.openedId) inp.onmidimessage = null
    })
    this.openedId = null
    if (!name) return true
    let found: MIDIInput | null = null
    this.access.inputs.forEach((inp) => {
      if ((inp.name ?? inp.id) === name) found = inp
    })
    if (!found) return false
    ;(found as MIDIInput).onmidimessage = (e: MIDIMessageEvent): void => this.onMessage(e)
    this.openedId = (found as MIDIInput).id
    return true
  }

  subscribe(cb: (devs: MidiDevice[]) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private notifyListeners(): void {
    const devs = this.listDevices()
    this.listeners.forEach((l) => l(devs))
  }

  beginLearn(cb: LearnResolver): void {
    this.learnCb = cb
  }

  cancelLearn(): void {
    this.learnCb = null
  }

  private onMessage(e: MIDIMessageEvent): void {
    const data = e.data
    if (!data || data.length < 2) return
    const status = data[0] & 0xf0
    const channel = data[0] & 0x0f
    let binding: MidiBinding | null = null
    if (status === 0x90 && (data[2] ?? 0) > 0) {
      binding = { kind: 'note', channel, number: data[1] }
    } else if (status === 0xb0 && (data[2] ?? 0) > 0) {
      binding = { kind: 'cc', channel, number: data[1] }
    }
    if (!binding) return

    // Learn mode wins
    if (this.learnCb) {
      const cb = this.learnCb
      this.learnCb = null
      cb(binding)
      return
    }

    // Match against bindings in current session.
    const st = useStore.getState()
    const session = st.session
    // Scene triggers
    for (const s of session.scenes) {
      if (matches(s.midiTrigger, binding)) {
        // Scene trigger toggles: if it's the active scene, stop; else trigger.
        if (st.engine.activeSceneId === s.id) {
          window.api.stopAll()
        } else {
          window.api.triggerScene(s.id)
        }
        return
      }
    }
    // Track triggers — fire that track's cell in the focused scene.
    for (const t of session.tracks) {
      if (matches(t.midiTrigger, binding)) {
        const sceneId = session.focusedSceneId
        if (!sceneId) return
        const active = !!st.engine.activeBySceneAndTrack[sceneId]?.[t.id]
        if (active) window.api.stopCell(sceneId, t.id)
        else window.api.triggerCell(sceneId, t.id)
        return
      }
    }
  }
}

function matches(a: MidiBinding | undefined, b: MidiBinding): boolean {
  if (!a) return false
  return a.kind === b.kind && a.channel === b.channel && a.number === b.number
}

export const midi = new MidiManager()
