import type { Cell, Modulation, Scene, SequencerParams, Session, Track } from './types'

export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10)
}

export const DEFAULT_MODULATION: Modulation = {
  enabled: false,
  depthPct: 10,
  rateHz: 1,
  shape: 'sine'
}

export const DEFAULT_SEQUENCER: SequencerParams = {
  enabled: false,
  steps: 8,
  syncMode: 'sync',
  bpm: 120,
  stepMs: 500,
  stepValues: ['0', '0', '0', '0', '0', '0', '0', '0', '', '', '', '', '', '', '', '']
}

export function makeCell(defaults: {
  destIp: string
  destPort: number
  oscAddress: string
}): Cell {
  return {
    destIp: defaults.destIp,
    destPort: defaults.destPort,
    destLinkedToDefault: true,
    oscAddress: defaults.oscAddress,
    addressLinkedToDefault: true,
    value: '0',
    delayMs: 0,
    transitionMs: 0,
    modulation: { ...DEFAULT_MODULATION },
    sequencer: {
      ...DEFAULT_SEQUENCER,
      stepValues: [...DEFAULT_SEQUENCER.stepValues]
    }
  }
}

// Generate a fully random HSL color, constrained to reasonable saturation/lightness
// so scenes stay visually distinct and legible on the dark theme.
export function randomSceneColor(): string {
  const h = Math.floor(Math.random() * 360)
  const s = 55 + Math.floor(Math.random() * 30) // 55..85
  const l = 50 + Math.floor(Math.random() * 15) // 50..65
  return hslToHex(h, s, l)
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number): number => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): number => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
    return Math.round(c * 255)
  }
  const r = f(0).toString(16).padStart(2, '0')
  const g = f(8).toString(16).padStart(2, '0')
  const b = f(4).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

export function makeScene(index: number): Scene {
  return {
    id: uid('s_'),
    name: `Scene ${index + 1}`,
    color: randomSceneColor(),
    notes: '',
    durationSec: 5,
    nextMode: 'off',
    cells: {}
  }
}

export function makeTrack(index: number): Track {
  return {
    id: uid('t_'),
    name: `Message ${index + 1}`
  }
}

export function makeEmptySession(): Session {
  const track = makeTrack(0)
  const scene = makeScene(0)
  const session: Session = {
    version: 1,
    name: 'Untitled',
    tickRateHz: 30,
    globalBpm: 120,
    sequenceLength: 32,
    defaultOscAddress: '/dataflou/value',
    defaultDestIp: '127.0.0.1',
    defaultDestPort: 9000,
    tracks: [track],
    scenes: [scene],
    sequence: new Array(128).fill(null),
    focusedSceneId: scene.id,
    midiInputName: null
  }
  session.sequence[0] = scene.id
  scene.cells[track.id] = makeCell({
    destIp: session.defaultDestIp,
    destPort: session.defaultDestPort,
    oscAddress: session.defaultOscAddress
  })
  return session
}

export function autoDetectOscArg(
  raw: string
): { type: 'i' | 'f' | 's' | 'T' | 'F'; value: number | string | boolean } {
  const s = raw.trim()
  if (s === '') return { type: 's', value: '' }
  if (/^(true|TRUE|True)$/.test(s)) return { type: 'T', value: true }
  if (/^(false|FALSE|False)$/.test(s)) return { type: 'F', value: false }
  if (/^-?\d+$/.test(s)) {
    const n = Number(s)
    if (Number.isSafeInteger(n) && n >= -2147483648 && n <= 2147483647) {
      return { type: 'i', value: n }
    }
  }
  if (/^-?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s)) {
    const n = Number(s)
    if (Number.isFinite(n)) return { type: 'f', value: n }
  }
  return { type: 's', value: raw }
}

export function readNumber(raw: string): number | null {
  const s = raw.trim()
  if (s === '') return null
  if (/^(true|TRUE|True)$/.test(s)) return 1
  if (/^(false|FALSE|False)$/.test(s)) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
