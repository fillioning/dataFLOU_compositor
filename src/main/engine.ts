// Scene engine: per-track state machine + fixed-tick LFO + scene auto-advance.
//
// Playback model:
//  - Each Track has at most ONE active Cell at any time (across all scenes).
//  - Triggering a Cell:
//      * After its delayMs, morph the track's center value from whatever it is now
//        to the new Cell's value over transitionMs (linear). LFO phase for the track
//        continues uninterrupted.
//  - Stopping a Cell:
//      * Morph center from current → 0 over transitionMs, then disarm (no more OSC).
//  - Scene trigger: equivalent to triggering every non-empty cell in that column.
//  - Scene auto-advance: only driven by explicit scene triggers (individual cell
//    triggers do NOT start the scene duration timer). After durationSec, nextMode
//    picks the next scene (or off).

import type { Cell, EngineState, LfoShape, Scene, Session } from '@shared/types'
import { autoDetectOscArg, readNumber } from '@shared/factory'
import { OscSender } from './osc'

const TWO_PI = Math.PI * 2

interface TrackState {
  // Always-running phase 0..1
  phase: number
  // Center morph
  fromCenter: number
  toCenter: number
  morphStart: number // hrtime ms
  morphMs: number
  // Stepped-random helpers
  rndStepLastTick: number
  rndStepValue: number
  rndSmoothPrev: number
  rndSmoothNext: number
  // Sequencer state
  seqStepIdx: number
  seqStepStart: number // hrtime ms when this step began
  // Active cell ref (source of params)
  activeSceneId: string | null
  stopping: boolean
  armed: boolean
  delayTimer: NodeJS.Timeout | null
  // For non-numeric values we only send on change. The "source" key tracks
  // scene/step so we know when to re-send.
  lastSentString: string | null
  lastStringAtSceneId: string | null
  lastStringAtStep: number
}

function makeTrackState(): TrackState {
  return {
    phase: 0,
    fromCenter: 0,
    toCenter: 0,
    morphStart: 0,
    morphMs: 0,
    rndStepLastTick: -1,
    rndStepValue: 0,
    rndSmoothPrev: 0,
    rndSmoothNext: 0,
    seqStepIdx: 0,
    seqStepStart: 0,
    activeSceneId: null,
    stopping: false,
    armed: false,
    delayTimer: null,
    lastSentString: null,
    lastStringAtSceneId: null,
    lastStringAtStep: -1
  }
}

function lfo(shape: LfoShape, phase: number, state: TrackState, tickIdx: number): number {
  // phase in [0,1). Returns [-1, 1]
  const p = phase - Math.floor(phase)
  switch (shape) {
    case 'sine':
      return Math.sin(p * TWO_PI)
    case 'triangle':
      return p < 0.5 ? p * 4 - 1 : 3 - p * 4
    case 'sawtooth':
      return p * 2 - 1
    case 'square':
      return p < 0.5 ? 1 : -1
    case 'rndStep': {
      // One new value per LFO period. "Period" is measured in ticks because
      // rate is already incorporated into phase; a new step fires when phase wraps.
      // Tracked via tick index the last time we wrapped.
      if (state.rndStepLastTick !== tickIdx) {
        // This check is not perfect but good enough; reset on phase wrap.
      }
      return state.rndStepValue
    }
    case 'rndSmooth': {
      // Cosine interpolation between prev and next over one period.
      const k = 0.5 - 0.5 * Math.cos(p * TWO_PI)
      return state.rndSmoothPrev * (1 - k) + state.rndSmoothNext * k
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export class SceneEngine {
  private sender = new OscSender()
  private session: Session | null = null
  // Map by trackId (tracks are global rows)
  private tracks = new Map<string, TrackState>()
  private tickTimer: NodeJS.Timeout | null = null
  private lastTickAt = 0
  private activeSceneId: string | null = null
  private activeSceneStartedAt: number | null = null
  private sceneAdvanceTimer: NodeJS.Timeout | null = null
  private onStateChange: ((s: EngineState) => void) | null = null
  // Latest computed output per (sceneId, trackId). Populated every tick by the
  // numeric path; emitted throttled via emitCurrentValues().
  private liveValues: Record<string, Record<string, string>> = {}
  private lastValueEmitAt = 0

  async start(): Promise<void> {
    await this.sender.start()
    this.startTicker()
  }

  stop(): void {
    this.stopTicker()
    this.sender.stop()
    this.tracks.forEach((ts) => {
      if (ts.delayTimer) clearTimeout(ts.delayTimer)
    })
    this.tracks.clear()
    this.clearSceneAdvance()
  }

  setOnStateChange(cb: (s: EngineState) => void): void {
    this.onStateChange = cb
  }

  private emitState(): void {
    if (!this.onStateChange || !this.session) return
    const active: Record<string, Record<string, boolean>> = {}
    const seq: Record<string, Record<string, number>> = {}
    for (const s of this.session.scenes) {
      active[s.id] = {}
      seq[s.id] = {}
    }
    this.tracks.forEach((ts, trackId) => {
      if (ts.armed && ts.activeSceneId && active[ts.activeSceneId]) {
        active[ts.activeSceneId][trackId] = true
        // Report current sequencer step only when the cell has sequencer enabled.
        const scene = this.session!.scenes.find((sc) => sc.id === ts.activeSceneId)
        const cell = scene?.cells[trackId]
        if (cell?.sequencer.enabled) {
          seq[ts.activeSceneId][trackId] = ts.seqStepIdx
        }
      }
    })
    this.onStateChange({
      activeBySceneAndTrack: active,
      seqStepBySceneAndTrack: seq,
      currentValueBySceneAndTrack: this.liveValues,
      activeSceneId: this.activeSceneId,
      activeSceneStartedAt: this.activeSceneStartedAt,
      tickRateHz: this.session.tickRateHz
    })
  }

  updateSession(next: Session): void {
    this.session = next
    // Ensure per-track state exists for each track; drop stale.
    const keep = new Set(next.tracks.map((t) => t.id))
    for (const id of this.tracks.keys()) {
      if (!keep.has(id)) {
        const ts = this.tracks.get(id)
        if (ts?.delayTimer) clearTimeout(ts.delayTimer)
        this.tracks.delete(id)
      }
    }
    for (const t of next.tracks) {
      if (!this.tracks.has(t.id)) this.tracks.set(t.id, makeTrackState())
    }
    // Apply new tick rate
    this.restartTicker()
    this.emitState()
  }

  setTickRate(hz: number): void {
    if (!this.session) return
    this.session.tickRateHz = clamp(hz, 10, 100)
    this.restartTicker()
  }

  triggerCell(sceneId: string, trackId: string): void {
    if (!this.session) return
    const scene = this.session.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    const cell = scene.cells[trackId]
    if (!cell) return
    const ts = this.tracks.get(trackId)
    if (!ts) return

    if (ts.delayTimer) {
      clearTimeout(ts.delayTimer)
      ts.delayTimer = null
    }

    const start = (): void => {
      const curOut = this.computeCurrentOutput(trackId)
      ts.fromCenter = curOut
      // Target center: sequencer step 0 if sequencer enabled, else cell.value.
      const baseRaw = cell.sequencer.enabled
        ? cell.sequencer.stepValues[0] ?? cell.value
        : cell.value
      const target = readNumber(baseRaw)
      ts.toCenter = target ?? 0
      ts.morphStart = now()
      ts.morphMs = cell.transitionMs
      ts.activeSceneId = sceneId
      ts.armed = true
      ts.stopping = false
      // Reset sequencer to step 0 on trigger.
      ts.seqStepIdx = 0
      ts.seqStepStart = now()
      ts.lastSentString = null
      ts.lastStringAtSceneId = null
      ts.lastStringAtStep = -1
      this.emitState()
    }

    if (cell.delayMs > 0) {
      ts.delayTimer = setTimeout(() => {
        ts.delayTimer = null
        start()
      }, cell.delayMs)
    } else {
      start()
    }
  }

  stopCell(sceneId: string, trackId: string): void {
    const ts = this.tracks.get(trackId)
    if (!ts || !this.session) return
    // Only stop if this cell is actually the active one for the track.
    if (ts.activeSceneId !== sceneId) return
    this.beginStop(trackId)
  }

  private beginStop(trackId: string): void {
    const ts = this.tracks.get(trackId)
    if (!ts || !this.session) return
    if (ts.delayTimer) {
      clearTimeout(ts.delayTimer)
      ts.delayTimer = null
    }
    const cell = this.getActiveCell(trackId)
    const curOut = this.computeCurrentOutput(trackId)
    ts.fromCenter = curOut
    ts.toCenter = 0
    ts.morphStart = now()
    ts.morphMs = cell?.transitionMs ?? 0
    ts.stopping = true
    this.emitState()
  }

  stopScene(sceneId: string): void {
    if (!this.session) return
    // Stop any track whose active cell is currently in this scene.
    for (const [tid, ts] of this.tracks.entries()) {
      if (ts.armed && ts.activeSceneId === sceneId) this.beginStop(tid)
    }
    if (this.activeSceneId === sceneId) {
      this.activeSceneId = null
      this.clearSceneAdvance()
    }
    this.emitState()
  }

  pauseSequence(): void {
    // Freeze auto-advance without stopping cells. Cells keep playing/modulating.
    this.clearSceneAdvance()
  }

  resumeSequence(): void {
    if (!this.session) return
    // Re-arm from the current active scene's full duration (simple approach).
    const id = this.activeSceneId
    if (!id) return
    const scene = this.session.scenes.find((s) => s.id === id)
    if (scene) this.armSceneAdvance(scene)
  }

  triggerScene(sceneId: string): void {
    if (!this.session) return
    const scene = this.session.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    for (const trackId of Object.keys(scene.cells)) {
      this.triggerCell(sceneId, trackId)
    }
    this.activeSceneId = sceneId
    this.activeSceneStartedAt = Date.now()
    this.armSceneAdvance(scene)
    this.emitState()
  }

  private armSceneAdvance(scene: Scene): void {
    this.clearSceneAdvance()
    this.sceneAdvanceTimer = setTimeout(() => {
      if (scene.nextMode === 'off') {
        // Only clear the active-scene flag if no cell in this scene is still
        // "doing something" (modulating or sequencing). Otherwise keep it held
        // until the last active cell stops — matches the user's requested
        // "except when modulation or sequencer is playing" carve-out.
        if (!this.sceneHasOngoingActivity(scene.id)) {
          this.activeSceneId = null
          this.activeSceneStartedAt = null
        }
        this.emitState()
      } else {
        this.advanceScene(scene)
      }
    }, scene.durationSec * 1000)
  }

  private sceneHasOngoingActivity(sceneId: string): boolean {
    if (!this.session) return false
    const scene = this.session.scenes.find((s) => s.id === sceneId)
    if (!scene) return false
    for (const [trackId, ts] of this.tracks.entries()) {
      if (ts.armed && ts.activeSceneId === sceneId) {
        const cell = scene.cells[trackId]
        if (cell?.modulation.enabled || cell?.sequencer.enabled) return true
      }
    }
    return false
  }

  private clearSceneAdvance(): void {
    if (this.sceneAdvanceTimer) {
      clearTimeout(this.sceneAdvanceTimer)
      this.sceneAdvanceTimer = null
    }
  }

  private advanceScene(current: Scene): void {
    if (!this.session) return
    const len = Math.max(1, Math.min(128, this.session.sequenceLength ?? 128))
    const seq = this.session.sequence.slice(0, len)
    const presentInSeq = seq.filter((id): id is string => !!id)
    if (presentInSeq.length === 0) return
    let nextId: string | null = null
    if (current.nextMode === 'next') {
      const start = seq.findIndex((id) => id === current.id)
      if (start < 0) {
        nextId = presentInSeq[0]
      } else {
        for (let i = 1; i <= seq.length; i++) {
          const idx = (start + i) % seq.length
          if (seq[idx]) {
            nextId = seq[idx]
            break
          }
        }
      }
    } else if (current.nextMode === 'random') {
      const pool = presentInSeq.filter((id) => id !== current.id)
      const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : presentInSeq[0]
      nextId = pick
    }
    if (nextId) this.triggerScene(nextId)
  }

  stopAll(): void {
    for (const [tid, ts] of this.tracks.entries()) {
      if (ts.armed || ts.delayTimer) this.beginStop(tid)
    }
    this.clearSceneAdvance()
    this.activeSceneId = null
    this.activeSceneStartedAt = null
    this.emitState()
  }

  panic(): void {
    for (const ts of this.tracks.values()) {
      if (ts.delayTimer) {
        clearTimeout(ts.delayTimer)
        ts.delayTimer = null
      }
      ts.armed = false
      ts.stopping = false
      ts.activeSceneId = null
      ts.morphMs = 0
      ts.fromCenter = 0
      ts.toCenter = 0
    }
    this.clearSceneAdvance()
    this.activeSceneId = null
    this.activeSceneStartedAt = null
    this.emitState()
  }

  // ----- Ticking -----

  private startTicker(): void {
    if (!this.session) {
      // Kick off at 30Hz default until session arrives.
      this.tickTimer = setInterval(() => this.tick(), 1000 / 30)
      return
    }
    const hz = clamp(this.session.tickRateHz, 10, 100)
    this.tickTimer = setInterval(() => this.tick(), 1000 / hz)
  }

  private stopTicker(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }

  private restartTicker(): void {
    this.stopTicker()
    this.startTicker()
  }

  private tickIdx = 0

  private tick(): void {
    if (!this.session) return
    const t = now()
    const dt = this.lastTickAt === 0 ? 0 : (t - this.lastTickAt) / 1000
    this.lastTickAt = t
    this.tickIdx++

    for (const [trackId, ts] of this.tracks.entries()) {
      if (!ts.armed && !ts.stopping) continue
      const cell = this.getActiveCell(trackId)
      if (!cell) continue

      // Advance LFO phase
      if (cell.modulation.enabled) {
        const prevPhase = ts.phase
        ts.phase += cell.modulation.rateHz * dt
        if (Math.floor(ts.phase) !== Math.floor(prevPhase)) {
          ts.rndSmoothPrev = ts.rndSmoothNext
          ts.rndSmoothNext = Math.random() * 2 - 1
          ts.rndStepValue = Math.random() * 2 - 1
          ts.rndStepLastTick = this.tickIdx
        }
      }

      // Advance sequencer step
      if (cell.sequencer.enabled && !ts.stopping) {
        const stepDurMs =
          cell.sequencer.syncMode === 'sync'
            ? 60000 / Math.max(1, cell.sequencer.bpm)
            : Math.max(1, cell.sequencer.stepMs)
        let stepChanged = false
        while (t - ts.seqStepStart >= stepDurMs) {
          ts.seqStepStart += stepDurMs
          const steps = Math.max(1, Math.min(16, cell.sequencer.steps))
          ts.seqStepIdx = (ts.seqStepIdx + 1) % steps
          stepChanged = true
        }
        if (stepChanged) this.emitState()
      }

      // Resolve the base value string: sequencer step value if enabled, else cell.value.
      const baseRaw = cell.sequencer.enabled
        ? cell.sequencer.stepValues[ts.seqStepIdx] ?? cell.value
        : cell.value

      // Morph progress (transition only applies on scene change, not step changes).
      const morphP = ts.morphMs > 0 ? clamp((t - ts.morphStart) / ts.morphMs, 0, 1) : 1

      const arg = autoDetectOscArg(baseRaw)

      if (arg.type === 's' || arg.type === 'T' || arg.type === 'F') {
        const stepKey = cell.sequencer.enabled ? ts.seqStepIdx : -1
        const changed =
          ts.lastSentString !== baseRaw ||
          ts.lastStringAtSceneId !== ts.activeSceneId ||
          ts.lastStringAtStep !== stepKey
        if (morphP >= 1 && changed) {
          this.sender.send(cell.destIp, cell.destPort, cell.oscAddress, arg)
          ts.lastSentString = baseRaw
          ts.lastStringAtSceneId = ts.activeSceneId
          ts.lastStringAtStep = stepKey
        }
        this.recordLiveValue(ts.activeSceneId ?? '', trackId, baseRaw)
        if (ts.stopping && morphP >= 1) this.disarm(ts)
        continue
      }

      // Numeric path.
      // If sequencer is active, the "center" jumps instantly to the step value.
      // If not, it morphs from fromCenter→toCenter over morphMs.
      let center: number
      if (cell.sequencer.enabled) {
        center = readNumber(baseRaw) ?? 0
        // Still honor the initial morph-in on trigger: blend for the first morph.
        if (morphP < 1) {
          center = ts.fromCenter + (center - ts.fromCenter) * morphP
        }
      } else {
        center = ts.fromCenter + (ts.toCenter - ts.fromCenter) * morphP
      }

      let out = center
      if (cell.modulation.enabled && !ts.stopping) {
        const lfoVal = lfo(cell.modulation.shape, ts.phase, ts, this.tickIdx)
        const magnitude = Math.max(Math.abs(center), 1) * (cell.modulation.depthPct / 100)
        out = center + lfoVal * magnitude
      }

      const sendType: 'i' | 'f' =
        arg.type === 'i' && !cell.modulation.enabled ? 'i' : 'f'
      const finalVal = sendType === 'i' ? Math.round(out) : out
      this.sender.send(cell.destIp, cell.destPort, cell.oscAddress, {
        type: sendType,
        value: finalVal
      })

      // Record for the renderer's live display.
      this.recordLiveValue(
        ts.activeSceneId ?? '',
        trackId,
        sendType === 'i' ? String(finalVal) : finalVal.toFixed(3)
      )

      if (ts.stopping && morphP >= 1) this.disarm(ts)
    }

    // Throttle live-value emits to ~20Hz to keep IPC cheap.
    if (t - this.lastValueEmitAt >= 50) {
      this.lastValueEmitAt = t
      this.emitState()
    }
  }

  private recordLiveValue(sceneId: string, trackId: string, value: string): void {
    if (!sceneId) return
    let row = this.liveValues[sceneId]
    if (!row) {
      row = {}
      this.liveValues[sceneId] = row
    }
    row[trackId] = value
  }

  private disarm(ts: TrackState): void {
    const wasScene = ts.activeSceneId
    // Drop the live-value entry so the cell tile stops "ghost-displaying".
    if (wasScene && this.liveValues[wasScene]) {
      for (const tid of Object.keys(this.liveValues[wasScene])) {
        if (this.tracks.get(tid) === ts) delete this.liveValues[wasScene][tid]
      }
    }
    ts.armed = false
    ts.stopping = false
    ts.activeSceneId = null
    // If a scene was "held open" (duration expired but modulation kept it alive),
    // clear activeSceneId now that the last active cell has stopped.
    if (
      wasScene &&
      this.activeSceneId === wasScene &&
      this.sceneAdvanceTimer === null &&
      !this.sceneHasOngoingActivity(wasScene)
    ) {
      this.activeSceneId = null
      this.activeSceneStartedAt = null
    }
    this.emitState()
  }

  private getActiveCell(trackId: string): Cell | null {
    const ts = this.tracks.get(trackId)
    if (!ts || !ts.activeSceneId || !this.session) return null
    const scene = this.session.scenes.find((s) => s.id === ts.activeSceneId)
    return scene?.cells[trackId] ?? null
  }

  private computeCurrentOutput(trackId: string): number {
    const ts = this.tracks.get(trackId)
    if (!ts || !this.session) return 0
    const cell = this.getActiveCell(trackId)
    const t = now()
    let center: number
    if (cell?.sequencer.enabled) {
      const raw = cell.sequencer.stepValues[ts.seqStepIdx] ?? cell.value
      center = readNumber(raw) ?? 0
    } else {
      const morphP = ts.morphMs > 0 ? clamp((t - ts.morphStart) / ts.morphMs, 0, 1) : 1
      center = ts.fromCenter + (ts.toCenter - ts.fromCenter) * morphP
    }
    if (!cell || !cell.modulation.enabled) return center
    const baseRaw = cell.sequencer.enabled
      ? cell.sequencer.stepValues[ts.seqStepIdx] ?? cell.value
      : cell.value
    const arg = autoDetectOscArg(baseRaw)
    if (arg.type === 's' || arg.type === 'T' || arg.type === 'F') return center
    const lfoVal = lfo(cell.modulation.shape, ts.phase, ts, this.tickIdx)
    const magnitude = Math.max(Math.abs(center), 1) * (cell.modulation.depthPct / 100)
    return center + lfoVal * magnitude
  }

}

function now(): number {
  const t = process.hrtime()
  return t[0] * 1000 + t[1] / 1e6
}
