// Shared types used by main, preload, and renderer.

export type LfoShape = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'rndStep' | 'rndSmooth'
// NextMode — the "follow action" executed when a scene's duration ends
// AND the per-scene play counter has reached `multiplicator`.
// Modelled on Ableton Live's clip follow actions.
//
//   stop   — do nothing (active flag clears unless cells are still running)
//   loop   — re-trigger this same scene (indefinite playback)
//   next   — next non-null slot in the sequence (wraps around)
//   prev   — previous non-null slot in the sequence (wraps around)
//   first  — jump to the first non-null slot in the sequence
//   last   — jump to the last non-null slot in the sequence
//   any    — random pick from every scene present in the sequence (including self)
//   other  — random pick from every scene present in the sequence EXCEPT self
//
// Migration: pre-rework sessions used 'off' | 'next' | 'random' which map to
// 'stop' | 'next' | 'any' respectively (handled in propagateDefaults).
export type NextMode =
  | 'stop'
  | 'loop'
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'any'
  | 'other'

// Order here matters for the Inspector dropdown order: Ramp sits second,
// right before Envelope, so the "one-shot" options are grouped. The
// three modular-synth-inspired additions (sh / slew / chaos) live at the
// end, after Random, since they're kindred spirits.
export type ModType =
  | 'lfo'
  | 'ramp'
  | 'envelope'
  | 'arpeggiator'
  | 'random'
  | 'sh'
  | 'slew'
  | 'chaos'
export type LfoMode = 'unipolar' | 'bipolar'
export type LfoSync = 'free' | 'bpm'
// Envelope / Ramp sync:
//   'synced'   — stages are fractions of scene duration (A+D+S+R ≤ 100%).
//   'free'     — stages are absolute milliseconds (each max 10 000 ms).
//   'freeSync' — stages are fractions of a user-specified Total (ms). Same
//                feel as 'synced' (stages as %) but decoupled from the scene.
export type EnvSync = 'synced' | 'free' | 'freeSync'

// Arpeggiator — walks through a computed "ladder" of N steps derived from
// the user's Value, at the modulation rate.
export type ArpMode =
  | 'up'
  | 'down'
  | 'upDown'
  | 'downUp'
  | 'exclusion'
  | 'walk'
  | 'drunk'
  | 'random'
export type MultMode = 'div' | 'mult' | 'divMult'

export interface ArpeggiatorParams {
  steps: number // 1..8
  arpMode: ArpMode
  multMode: MultMode
}

// Random Generator — seeded PRNG that emits random values at the modulation
// rate. Seed is derived from the cell's Value string (so the same Value gives
// a reproducible stream).
export type RandomValueType = 'int' | 'float' | 'colour'
export interface RandomParams {
  valueType: RandomValueType
  min: number // inclusive
  max: number // inclusive (applies per channel for 'colour')
}

export interface EnvelopeParams {
  // Free-mode times (ms); each max 10 000.
  attackMs: number
  decayMs: number
  sustainMs: number
  releaseMs: number
  // Synced-mode fractions of scene duration; A+D+S+R should sum to <= 1.
  // Also used as the fraction of `totalMs` when sync='freeSync'.
  attackPct: number
  decayPct: number
  sustainPct: number
  releasePct: number
  // Held value between decay and release (0..1).
  sustainLevel: number
  sync: EnvSync
  // Total envelope length (ms) in sync='freeSync' mode. 0.1..300 000. The
  // Pct fields scale by this instead of the scene duration — gives a
  // synced-feel envelope whose length is independent of the scene.
  totalMs: number
}

// Sample & Hold — emits a fresh sample on every clock tick, holds between.
// Additive: the held value is scaled by depthPct and added to center (same
// signal path as the LFO). Mode picks bipolar (-1..1) vs unipolar (0..1)
// range, shared with LFO semantics.
export interface SampleHoldParams {
  // Smooth between samples (cosine-interpolated, like LFO's rndSmooth) vs
  // hard step. Smooth = analog S&H with built-in slew; step = classic
  // digital stair.
  smooth: boolean
  // Probability in [0, 1] that a clock tick produces a NEW sample. Below
  // 1.0 the output occasionally "holds" across multiple ticks, giving
  // that Music-Thing-Turing-Machine locked-in feel without the full state
  // machine.
  probability: number
}

// Slew limiter — generates an internal random target on each clock tick,
// then slews from the current value toward that target at independent
// rise/fall rates. Feels like a tamed random LFO with analog glide.
// Additive like LFO.
export interface SlewParams {
  // Rise / fall half-life in ms (time for 63 % of the move, exponential).
  // Split so you can dial in a slow-up / fast-down envelope feel.
  riseMs: number
  fallMs: number
  // Whether each clock tick draws a fresh random target (true) or just
  // follows a bipolar square wave at the clock rate (false — useful for
  // predictable glide ramps).
  randomTarget: boolean
}

// Chaos — iterates the logistic map x ← r · x · (1 − x) at the clock rate.
// Parameter `r` in [3.4, 4.0] tips the map from stable 2-/4-/8-cycles
// through the period-doubling cascade into full chaos. Produces values in
// (0, 1), mapped to bipolar at output.
export interface ChaosParams {
  r: number // 3.4 .. 4.0
}

// Ramp modulator — one-shot 0→target ramp over `rampMs` (or scene fraction
// when synced). Curve bends the interpolation: 0% = linear, +100% = strong
// ease-out (fast rise, long tail), -100% = strong ease-in (slow rise,
// sharp finish). When the ramp completes, modulation is effectively done
// and the clip's play-button sweep stops animating.
export interface RampParams {
  rampMs: number      // free-mode ramp length (ms), 0.1..300 000
  curvePct: number    // -100..100, linear at 0
  sync: EnvSync       // reuses envelope sync modes: synced / free / freeSync
  totalMs: number     // length (ms) used when sync='freeSync'. Same range as rampMs.
  // Mode: how the ramp behaves over time.
  //   'normal'   — one-shot 0 → 1 ramp, holds at 1 after completing (default)
  //   'inverted' — one-shot 1 → 0 ramp (mirror of normal), holds at 0
  //   'loop'     — repeats the 0 → 1 ramp forever, retriggering at every period
  mode: 'normal' | 'inverted' | 'loop'
}

export interface Modulation {
  enabled: boolean
  type: ModType
  // LFO params
  shape: LfoShape
  mode: LfoMode
  depthPct: number // 0..100
  rateHz: number // 0.01..10 (used when sync='free')
  sync: LfoSync
  divisionIdx: number // 0..11 index into the BPM-synced time division table
  dotted: boolean
  triplet: boolean
  // Envelope params (used when type='envelope')
  envelope: EnvelopeParams
  // Ramp params (used when type='ramp')
  ramp: RampParams
  // Arpeggiator params (used when type='arpeggiator').
  // Rate is shared with the LFO (rateHz/sync/divisionIdx/dotted/triplet).
  arpeggiator: ArpeggiatorParams
  // Random Generator params (used when type='random'). Rate also shared.
  random: RandomParams
  // S&H / Slew / Chaos params (all share the LFO's rate controls).
  sh: SampleHoldParams
  slew: SlewParams
  chaos: ChaosParams
}

// Sequencer tempo source:
//   'bpm'   — lock step rate to the session's global BPM
//   'tempo' — use the sequencer's own per-clip bpm slider
//   'free'  — use the per-clip stepMs value (independent of any BPM)
export type SeqSyncMode = 'bpm' | 'tempo' | 'free'

// Sequencer drive mode:
//   'steps'      — classic 1..16 step cycle, each step plays stepValues[i].
//   'euclidean'  — Bjorklund pattern: `pulses` active hits distributed as
//                  evenly as possible over `steps` total, rotated by
//                  `rotation`. Active step i still emits stepValues[i];
//                  inactive steps are silent.
//   'polyrhythm' — Two independent ring clocks of length `ringALength` and
//                  `ringBLength`; each "fires" at multiples of its length
//                  inside the master cycle. Combined via `combine` (OR /
//                  XOR / AND) into a gate. Tiny inputs → long emergent
//                  patterns (3-against-7, etc.).
//   'density'    — Each step has an internal probability derived from
//                  hash(step, seed); fires when that probability falls
//                  under `density / 100`. Same seed = same personality;
//                  density is a master "how busy" knob.
//   'cellular'   — 1D Wolfram cellular automaton. Each cycle the row
//                  evolves: every step's next state is f(left, self,
//                  right) per the chosen `rule` (0..255). Rule 30 ≈
//                  quasi-random, Rule 90 ≈ Sierpinski symmetry, Rule 110
//                  ≈ gliders.
//   'drift'      — Brownian playhead. Step row is fixed; the head walks
//                  +1 / 0 / -1 each clock based on `bias` (-100..+100%).
//                  `edge` controls boundary behaviour (wrap or reflect).
//   'ratchet'    — Each step has a chance (`ratchetProb` %) of
//                  subdividing into a quick burst of 2..`ratchetMaxDiv`
//                  re-triggers within the step duration. Most audible on
//                  string / bool / int OSC targets that interpret each
//                  send as a fresh trigger.
//   'bounce'     — Real ball-bounce physics. Each cycle is one "drop":
//                  step 0 is the loud first impact, subsequent steps
//                  bounce at GEOMETRICALLY SHRINKING intervals with
//                  EXPONENTIALLY DECAYING amplitude. A single
//                  `bounceDecay` knob controls "bounciness" — both the
//                  time-acceleration and the value-decay come from the
//                  same coefficient so the gesture is unified.
//   'draw'       — Freely-drawn automation curve. The user sketches
//                  a curve on a rectangular canvas with the mouse;
//                  each x-position is a step, each y-position is the
//                  emitted value (normalised to [0, 1]). Step count
//                  caps higher than other modes (up to 64) so the
//                  curve has enough resolution to feel like a real
//                  DAW automation lane. Generative + Variation knobs
//                  don't apply — the curve IS the user's intention.
export type SeqMode =
  | 'steps'
  | 'euclidean'
  | 'polyrhythm'
  | 'density'
  | 'cellular'
  | 'drift'
  | 'ratchet'
  | 'bounce'
  | 'draw'

export type SeqCombine = 'or' | 'xor' | 'and'
export type SeqDriftEdge = 'wrap' | 'reflect'

export interface SequencerParams {
  enabled: boolean
  steps: number // 1..16, active count / master cycle length
  syncMode: SeqSyncMode
  bpm: number // 10..500 — used when syncMode='bpm' (1 step per beat)
  stepMs: number // used when syncMode='free'
  stepValues: string[] // fixed length 16; only first `steps` fire at runtime
  // Pattern dispatch.
  mode: SeqMode

  // Euclidean fields — only meaningful when mode === 'euclidean'.
  pulses: number   // 0..steps
  rotation: number // 0..steps-1

  // Polyrhythm fields — only meaningful when mode === 'polyrhythm'.
  ringALength: number // 1..16
  ringBLength: number // 1..16
  combine: SeqCombine

  // Density fields — only meaningful when mode === 'density'.
  density: number // 0..100, master probability scaler
  seed: number    // 0..255, picks the "personality" of which steps fire

  // Cellular fields — only meaningful when mode === 'cellular'.
  rule: number     // 0..255, Wolfram rule number
  cellSeed: number // 0..65535 bitmask of initial row; 0 = single center cell
  // Seed LFO — when depth > 0, the engine re-seeds the cellular
  // automaton on each cycle wrap with a value modulated around
  // cellSeed by a slow LFO. Lets the pattern slowly drift through
  // adjacent seed values over time, producing a generative
  // "wandering pattern" feel without manually changing seed.
  cellularSeedLfoDepth: number // 0..100 (% of full 0..65535 range)
  cellularSeedLfoRate: number  // 0.01..10 Hz

  // Drift fields — only meaningful when mode === 'drift'.
  bias: number       // -100..+100 (% forward bias; 0 = pure random walk)
  edge: SeqDriftEdge

  // Ratchet fields — only meaningful when mode === 'ratchet'.
  ratchetProb: number   // 0..100, per-step probability of subdividing
  ratchetMaxDiv: number // 2..16, max subdivision count (always integer)
  // Variation: 0 = every step uses the global Probability + MaxDiv
  // verbatim. 100 = each step's prob & maxDiv are hash-randomised
  // off the global value so bursts feel less uniform across the
  // cycle. Deterministic per (step, seed) so the same seed always
  // produces the same per-step variation.
  ratchetVariation: number // 0..100
  // Mode: shape of the sub-pulse values within each burst.
  //   'octaves'  — every sub-pulse emits stepValue / subdiv (proportional
  //                scaling, like dividing the tempo)
  //   'ramp'     — sub i emits stepValue × (i+1)/subdiv (snare-roll rise)
  //   'inverse'  — mirror of Ramp: stepValue × (subdiv-i)/subdiv (fall)
  //   'pingpong' — rises then falls within the burst (triangle window)
  //   'echo'     — exponential decay (each sub ≈ base × 0.7^i, like a
  //                ball-bounce or guitar palm-mute echo)
  //   'trill'    — alternates base / base*0.5 across sub-pulses (an
  //                ornamental two-note flicker)
  //   'random'   — hash-driven scatter (each sub-pulse different)
  ratchetMode:
    | 'octaves'
    | 'ramp'
    | 'inverse'
    | 'pingpong'
    | 'echo'
    | 'trill'
    | 'random'

  // Bounce fields — only meaningful when mode === 'bounce'.
  // Maps 0..100 → physical coefficient e ∈ [0.40, 0.95]:
  //   0   → "dead bounce" (e=0.40): quick collapse, last bounces nearly
  //         back-to-back, then the cycle resets.
  //   100 → "super bouncy" (e=0.95): bounces barely decay, intervals
  //         stay almost uniform, sustained train of pulses.
  // Drives BOTH the per-step duration (geometric shrink) and, in
  // generative mode, the per-step value decay — so what you see and
  // what you hear are tied to the same physical knob.
  bounceDecay: number   // 0..100

  // Generative mode — when true, per-step values are no longer read
  // from `stepValues[]`. Instead the cell's `value` becomes the seed
  // / base intention, and each step's emitted value is computed live
  // from a per-mode organic rule (Tide / Accent / Voicing / Wave /
  // Crowd / Terrain / Scatter — see factory.ts). `genAmount` is one
  // shared "Variation" knob that every mode reinterprets:
  //   Steps      — tide swell depth
  //   Euclidean  — accent strength on downbeat hits
  //   Polyrhythm — spread between Ring A / Ring B / coincidence
  //   Density    — sine-wave amplitude sampled by the gate
  //   Cellular   — excitement range from neighbour count
  //   Drift      — height of the terrain hills the walker samples
  //   Ratchet    — scatter width across a burst's sub-pulses
  // 0 = flat (every step at base); 100 = full swing (±1 around base
  // for Scale-0..1 cells, ±the base value otherwise).
  generative: boolean
  genAmount: number // 0..100

  // Rest behaviour — what the engine emits between sequencer step
  // boundaries (ticks where the value hasn't changed).
  //   'last' — re-send the same value every tick (default; useful
  //            for receivers that need a continuous stream).
  //   'hold' — send nothing until the value actually changes;
  //            receivers naturally hold their previous value. Cuts
  //            redundant OSC and lets receivers own the sample-and-
  //            hold semantics.
  restBehaviour: SeqRestBehaviour

  // Draw fields — only meaningful when mode === 'draw'. The user
  // sketches a curve directly with the mouse; each x-position is a
  // step, y-position is a normalised [0, 1] value. The canvas Y
  // axis is labelled with `drawValueMin` / `drawValueMax` so the
  // drawn 0..1 curve maps to whatever output range the user wants
  // (e.g. -1..1 bipolar, 0..127 MIDI, 0..100 percent). Cap is high
  // (up to 1024) so curves can be near-continuous for DAW-like
  // automation lanes.
  drawValues: number[] // length up to 1024, values in [0, 1]
  drawSteps: number    // 4..1024
  drawValueMin: number // value at curve y=0 (canvas floor)
  drawValueMax: number // value at curve y=1 (canvas ceiling)
}

// Sequencer rest-behaviour alias.
export type SeqRestBehaviour = 'last' | 'hold'

export interface Cell {
  // Destination. If `destLinkedToDefault` is true, destIp/destPort track the session default.
  destIp: string
  destPort: number
  destLinkedToDefault: boolean
  // OSC address path. If `addressLinkedToDefault`, tracks session default.
  oscAddress: string
  addressLinkedToDefault: boolean
  // Raw value string — type auto-detected at send time (bool → int → float → string).
  value: string
  delayMs: number // 0..10000
  transitionMs: number // 0..10000
  modulation: Modulation
  sequencer: SequencerParams
  // If true, each numeric output (post-modulation) is clamped to [0, 1].
  // Applies to each token when `value` contains space-separated values.
  scaleToUnit: boolean
  // MIDI binding that triggers/stops just this clip (one per cell).
  midiTrigger?: MidiBinding
}

/** Max number of space-separated values allowed in a single Value box. */
export const MAX_VALUE_TOKENS = 16

// Track / Instrument vocabulary
// ────────────────────────────────────────────────────────────────────────
// Pre-merger naming: "Messages" = the rows in the Edit grid. Each row was
// a flat OSC sender.
//
// Merger naming (this build): "Instruments". Each row is either:
//   • a TEMPLATE header — a parent group à la Reaper, holds no clips itself
//     but visually owns the rows below it; or
//   • a FUNCTION row — child of a Template, owns clips like the old Messages.
//
// We keep the storage shape as a flat `tracks: Track[]` so the engine,
// scene cell maps, MIDI bindings, etc. stay untouched. The new `kind` /
// `parentTrackId` fields just describe the visual hierarchy.
//
// Old sessions (pre-merger) load with every track defaulted to
// `kind: 'function'` / no parent — they render as orphan Functions, exactly
// matching the previous look.
export type TrackKind = 'template' | 'function'

export interface Track {
  id: string
  name: string
  // Reaper-style hierarchy. Templates are header rows that don't carry
  // their own clips; Functions are the child rows that do.
  kind: TrackKind
  // Function rows point at their owning template (nullable for orphan
  // functions instantiated outside any template).
  parentTrackId?: string
  // Source-of-truth for instantiated rows: the Pool template they came
  // from. Lets us refresh defaults if the template definition changes.
  // Both Template and Function rows can carry this.
  sourceTemplateId?: string
  sourceFunctionId?: string
  // Optional per-track defaults used by "Send to clips".
  defaultOscAddress?: string
  defaultDestIp?: string
  defaultDestPort?: number
  // MIDI binding for triggering this track's cell in the focused scene.
  midiTrigger?: MidiBinding
  // Snapshot of the source Function/Parameter's argSpec at
  // instantiation time. Drives the cell editor's split-input UI and
  // seeds initial cell values. Tracks are snapshots — Pool edits
  // don't propagate retroactively (drag the entry again to refresh).
  argSpec?: ParamArgSpec[]
  // Disable flag — when explicitly false, the engine skips this
  // track on any trigger path (cell or scene). Sidebar row renders
  // greyed out. Undefined / true means enabled (default). Used by
  // the Instrument-row Inspector's "enable/disable each Parameter"
  // toggles. On a Template (header) row, disabling cascades to its
  // Parameter children visually but each child still has its own
  // independent flag.
  enabled?: boolean
  // Per-arg-position persistence flags. Same length / order as
  // argSpec when present. When persistentSlots[i] is true, the
  // engine emits persistentValues[i] for that slot regardless of
  // scene triggers, modulators, or sequencer steps. Lets the
  // performer "pin" a few knobs while letting the rest morph.
  persistentSlots?: boolean[]
  // Captured pinned values, parallel to persistentSlots. Stored as
  // raw token strings so they round-trip cleanly through the
  // existing value parser (autoDetectOscArg). Captured at pin time
  // from the focused scene's cell.value[i]; cleared when unpinned.
  persistentValues?: string[]
}

// Pool / Instrument Templates
// ────────────────────────────────────────────────────────────────────────
// A Template = a named bundle of pre-mapped Functions (e.g. OCTOCOSME with
// volume / tilt / colour). Functions inside a Template inherit IP/port +
// OSC base path from the template unless they override.
//
// This deliberately mirrors dataFLOU's `ParamMeta` vocabulary so the
// eventual merger can import C++ library configs as Templates and export
// the user's authored Templates back out:
//   - paramType ↔ ParamType (Bool, Number, Vector, Colour, String…)
//   - nature ↔ Nature (Lin / Log / Exp)
//   - streamMode ↔ StreamMode (Streaming / Discrete / Polling)
//   - unit ↔ unit
//   - min/max/init ↔ range_min / range_max / range_init
export type FunctionParamType =
  | 'bool'
  | 'int'
  | 'float'
  | 'v2'
  | 'v3'
  | 'v4'
  | 'colour'
  | 'string'

export type FunctionParamNature = 'lin' | 'log' | 'exp'

export type FunctionStreamMode = 'streaming' | 'discrete' | 'polling'

export interface InstrumentFunction {
  id: string
  name: string                  // e.g. "Volume", "Tilt", "Colour"
  // OSC path. May start with "/" or be relative to the template's base
  // path (resolved at instantiation). e.g. "volume" + base "/octocosme"
  // → "/octocosme/volume".
  oscPath: string
  // Optional per-function destination override. Inherits from template
  // when absent.
  destIpOverride?: string
  destPortOverride?: number
  // Typed parameter metadata — informational today, drives auto-rendered
  // UI controls in a future iteration. Already useful for the merger
  // conversation: every Function is self-describing.
  paramType: FunctionParamType
  nature: FunctionParamNature
  streamMode: FunctionStreamMode
  min?: number
  max?: number
  init?: number
  unit?: string                 // "Hz", "dB", "°", "RGBA", "m/s", …
  smoothMs?: number
  // Free-form notes for the player.
  notes?: string
  // Multi-arg bundle spec — when present, every clip on a row
  // instantiated from this Function expects exactly `argSpec.length`
  // OSC args in this order. The cell editor renders one labeled
  // input per non-fixed entry; entries with `fixed` are invisibly
  // prepended on send (useful for protocol header pairs like the
  // Octocosme Pure Data patch's `[sender] [timestamp]` prefix that
  // its `list split 2` discards).
  argSpec?: ParamArgSpec[]
}

// Per-arg spec for a multi-arg OSC bundle. Drives the UI's split
// data-entry strip + initial value seeding.
export interface ParamArgSpec {
  // Display label shown above the input (or used as a tooltip on
  // fixed args). Free text, e.g. "HAUTEUR1".
  name: string
  // Type drives the input widget choice (number / bool / text) and
  // the value-token formatting at send time.
  type: 'float' | 'int' | 'bool' | 'string'
  // When set, this arg is invisibly prepended to every clip's value
  // string and never shown as an editable input. Used for protocol
  // prefixes the receiver discards (see Octocosme `list split 2`).
  fixed?: number | string | boolean
  // For editable numeric args.
  min?: number
  max?: number
  // Initial value used to seed a freshly-created cell. If omitted,
  // falls back to 0 / "" depending on `type`.
  init?: number | string | boolean
}

export interface InstrumentTemplate {
  id: string
  name: string                  // e.g. "OCTOCOSME"
  description: string
  color: string                 // hex; drives the Pool / sidebar nesting tint
  // Defaults inherited by every Function unless overridden.
  destIp: string
  destPort: number
  oscAddressBase: string        // e.g. "/octocosme"
  // Polyphony hint (informational for now; voice allocation is a later
  // engine feature). 1 = monophonic.
  voices: number
  functions: InstrumentFunction[]
  // True when this template is shipped by the app rather than authored
  // by the user. Read-only in the inspector.
  builtin?: boolean
  // True for the auto-created backing template behind an "Add Instrument"
  // sidebar row that hasn't been Saved-as-Template yet. The Pool drawer
  // hides drafts; they exist only to give the live Instrument row a
  // place to store function specs. "Save as Template" flips this to
  // undefined and the user can give the entry a name.
  draft?: boolean
}

// Standalone Parameter template — a single-Function blueprint that lives
// directly in the Pool, separate from the Instrument Templates. Useful
// for catch-all building blocks ("RGB light", "Knob", "Motor speed")
// that the user wants to drag straight onto the Edit-view sidebar as an
// orphan Function row without first wrapping them in an Instrument.
//
// Shape mirrors InstrumentFunction (same paramType / nature / streamMode
// vocabulary) plus a few presentation hints — `color` for the row stripe
// in the Edit sidebar after instantiation, and `builtin` so the shipped
// blueprints render read-only in the inspector. Unlike InstrumentFunction,
// `oscPath` here is a default (the user can override at instantiation
// time), and `destIp` / `destPort` give the parameter its own destination
// when there's no parent Template to inherit from.
export interface ParameterTemplate {
  id: string
  name: string                  // e.g. "RGB Light", "Knob", "Motor"
  description?: string
  color: string                 // hex; used for the orphan row's tint
  oscPath: string               // default OSC path when instantiated
  destIp: string
  destPort: number
  paramType: FunctionParamType
  nature: FunctionParamNature
  streamMode: FunctionStreamMode
  min?: number
  max?: number
  init?: number
  unit?: string
  smoothMs?: number
  notes?: string
  builtin?: boolean
  // See InstrumentFunction.argSpec — same semantics applied to a
  // standalone Parameter blueprint. Drag-drop instantiation
  // snapshots this onto the resulting Track.
  argSpec?: ParamArgSpec[]
}

export interface Pool {
  templates: InstrumentTemplate[]
  // Standalone single-parameter blueprints. Sourced from the builtin
  // library + user-authored entries. Persisted with the session for
  // self-containment.
  parameters: ParameterTemplate[]
}

export interface Scene {
  id: string
  name: string
  color: string // hex like "#ff7a3d"
  notes: string // free-form text shown italic under the name
  durationSec: number // 0.5..300
  nextMode: NextMode
  // How many times the scene plays before its follow action fires. 1 = play
  // once and advance (classic behavior). 2 = play twice then advance, etc.
  // Setting >1 with nextMode='loop' is effectively redundant (still loops
  // forever), but harmless.
  multiplicator: number
  // Optional per-scene Morph-in duration (ms). When this scene is
  // triggered by the user via GO / Space / trigger button, every cell
  // glides to its new target over this duration instead of using the
  // cell's own transitionMs. Overridden by an explicit transport-level
  // morph time if one is set at trigger time. Omitted = no per-scene
  // preference.
  morphInMs?: number
  // Sparse: key is trackId. Missing = empty cell.
  cells: Record<string, Cell>
  // MIDI binding for triggering the whole scene.
  midiTrigger?: MidiBinding
  // MIDI bindings for the per-Instrument group-trigger button shown
  // at each Template-row × Scene-column intersection. Key is the
  // Template (Instrument header) track id. Optional / sparse — the
  // engine only reacts to a binding when one is present.
  instrumentTriggers?: Record<string, MidiBinding>
}

export interface MidiBinding {
  kind: 'note' | 'cc'
  channel: number // 0..15
  number: number // note number or CC number
}

// ---- Meta Controller ----
// A global bank of 8 circular knobs. Each knob scales a normalized 0..1
// position into [min, max] via a curve (linear / log / exp), then blasts the
// value to up to 8 OSC destinations simultaneously. Live positions + config
// are saved with the session.

// All curve shapes applied by scaleMetaValue. See that function for the
// exact math of each. Grouped loosely:
//   Mathematical     linear log exp geom
//   Eased            easeIn easeOut cubic sqrt
//   S-shapes         sigmoid smoothstep
//   Perceptual       db gamma
//   Utility          step invert
export type MetaCurve =
  | 'linear'
  | 'log'
  | 'exp'
  | 'geom'
  | 'easeIn'
  | 'easeOut'
  | 'cubic'
  | 'sqrt'
  | 'sigmoid'
  | 'smoothstep'
  | 'db'
  | 'gamma'
  | 'step'
  | 'invert'

export interface MetaDest {
  destIp: string
  destPort: number
  oscAddress: string
  enabled: boolean
}

export interface MetaKnob {
  name: string // user-assignable ("Volume", "Color R", …)
  min: number // scaled output lower bound
  max: number // scaled output upper bound
  curve: MetaCurve
  value: number // normalized position 0..1 (what the UI shows; scaled at send)
  // Smoothing time (ms) applied to value changes in the engine — the knob
  // tweens from its current position toward the new target over this many
  // milliseconds, firing OSC at ~60 Hz. Smooths out the 1/127 quantization
  // steps of MIDI CC input so receivers see a continuous ramp rather than
  // a staircase. 0 = no smoothing (instant).
  smoothMs: number
  destinations: MetaDest[] // up to META_MAX_DESTS entries
  // Optional MIDI CC binding. While bound, incoming CC values (0..127) map
  // directly to normalized 0..1 knob position and broadcast to destinations.
  // Set via global MIDI Learn (same flow as scene / clip triggers). Although
  // the MidiBinding type supports notes, knobs are CC-only by convention.
  midiCc?: MidiBinding
}

export interface MetaController {
  visible: boolean // whether the bar is currently expanded in the UI
  selectedKnob: number // 0..7 — which knob's details are shown on the right
  height: number // pixels — user-resizable via drag handle at the bottom
  knobs: MetaKnob[] // fixed length META_KNOB_COUNT
}

// 32 knobs arranged as 4 banks of 8 (A/B/C/D). Only one bank is shown in
// the Meta Controller bar at a time; the bank selector lives to the right of
// the knob row. `selectedKnob` is a GLOBAL index (0..31).
export const META_KNOB_COUNT = 32
export const META_BANK_COUNT = 4
export const META_KNOBS_PER_BANK = 8
export const META_MAX_DESTS = 8

export interface Session {
  version: 1
  name: string
  tickRateHz: number // 10..300
  globalBpm: number // 10..500, default for sync-mode sequencers
  sequenceLength: number // 1..128, number of visible slots in the Sequence view
  defaultOscAddress: string
  defaultDestIp: string
  defaultDestPort: number
  tracks: Track[] // rows (Templates + Functions, see Track interface)
  scenes: Scene[] // columns
  // Pool of authored Instrument Templates. Sourced from a builtin
  // library + user-authored entries; persisted with the session so a
  // session is self-contained. Templates instantiate into rows of the
  // `tracks` array via the Pool drawer.
  pool: Pool
  sequence: (string | null)[] // 128-length array; only first `sequenceLength` are used
  focusedSceneId: string | null
  midiInputName: string | null
  // Transport-level MIDI bindings. These fire the cue GO (identical to
  // clicking the GO button / hitting Space) and set the transport-level
  // morph time (CC value 0..127 → 0..10 000 ms, linear). Both are
  // optional and CC/note-bindable via the global MIDI Learn workflow.
  goMidi?: MidiBinding
  morphTimeMidi?: MidiBinding
  // Global Meta Controller bank — 8 user-assignable knobs that broadcast a
  // scaled value to up to 8 OSC destinations each. Persisted with the session.
  metaController: MetaController
}

// ---- IPC payloads ----

export interface EngineState {
  activeBySceneAndTrack: Record<string, Record<string, boolean>>
  // Per (sceneId, trackId) → current sequencer step index (0-based).
  seqStepBySceneAndTrack: Record<string, Record<string, number>>
  // Per (sceneId, trackId) → the current output value as a string, for live
  // display in the cell tile. Updated at ~20Hz while any cell is armed.
  currentValueBySceneAndTrack: Record<string, Record<string, string>>
  activeSceneId: string | null
  activeSceneStartedAt: number | null
  // Which sequence slot was the source of the current activeSceneId.
  // Used by the Sequence-view grid to highlight ONLY the specific slot
  // that fired — a scene placed at multiple positions in the grid should
  // not highlight every instance simultaneously. `null` when the scene
  // was triggered from the palette / column header / MIDI / cue and
  // didn't originate from a specific sequence slot.
  activeSequenceSlotIdx: number | null
  // Wall-clock ms when pause was entered (Date.now()), or null if
  // running. Renderer countdowns use this to freeze their elapsed
  // calculation at this timestamp instead of Date.now() so the
  // visual display also pauses.
  pausedAt: number | null
  tickRateHz: number
}

// One outgoing OSC message as surfaced to the renderer (OSC monitor panel).
// Batched in main on a 50ms timer to keep IPC cheap — the monitor may see
// thousands of sends per second at 120Hz ticks × multiple active cells.
export interface AutosaveEntry {
  path: string
  mtimeMs: number
  sessionName: string
  sizeBytes: number
}

export interface OscEvent {
  timestamp: number // Date.now() ms
  ip: string
  port: number
  address: string
  args: { type: 'i' | 'f' | 's' | 'T' | 'F'; value: number | string | boolean }[]
}

// Fired when a send fails — surfaced in the UI as a red health dot next
// to destinations and as [ERR] rows in the OSC monitor. Socket-level
// errors that can't be attributed to one destination use ip='*', port=0.
export interface OscErrorEvent {
  timestamp: number
  ip: string
  port: number
  address: string
  message: string
}

// ─────────────────────────────────────────────────────────────────────
// Network discovery — passive OSC listener.
//
// The Pool drawer's Network tab surfaces every OSC sender on the local
// network that has hit our listening port. Each unique (ip, port)
// becomes a `DiscoveredOscDevice`; every distinct OSC address path that
// device has emitted becomes a `DiscoveredOscAddress`. The user can then
// drag a device onto the Edit sidebar to materialise it as an
// Instrument with one Parameter per observed address.
// ─────────────────────────────────────────────────────────────────────

// One OSC address path observed from a particular sender, with a tiny
// fingerprint of the latest arg shape so the UI can infer paramType.
export interface DiscoveredOscAddress {
  path: string
  lastSeen: number
  count: number
  // OSC type tags of the most recent message at this path. Drives
  // paramType inference when materialising as an Instrument
  // (e.g. one 'f' → float, three 'f' → v3, four 'f' → colour, etc.).
  argTypes: string[]
  // Truncated string-rendered preview of the latest args, for display.
  argsPreview: string
}

// One sender on the local network — keyed by `${ip}:${port}` so a
// single device that uses two source ports shows up as two rows
// (rare, but unambiguous and easy to reason about).
export interface DiscoveredOscDevice {
  id: string // `${ip}:${port}`
  ip: string
  port: number
  // When we first / most recently saw a packet from this sender.
  firstSeen: number
  lastSeen: number
  packetCount: number
  // Optional friendly name — for now the UI just shows the ip:port,
  // but reserving the field keeps mDNS / OSCQuery integration easy
  // later (a service announcement can fill this in).
  name?: string
  // Set of OSC paths this device has emitted. Capped at 256 to keep
  // pathological floods (e.g. a streaming bundle per pixel) bounded.
  addresses: DiscoveredOscAddress[]
}

// Status snapshot pushed to the renderer alongside the device list —
// tells the Network tab whether the listener is bound, what port it
// chose, and what local IPv4 addresses the user should point their
// sender at to be picked up.
export interface NetworkListenerStatus {
  enabled: boolean
  port: number
  localAddresses: string[]
  // Most recent bind error message ('' if none).
  lastError: string
}

// Window.api signature — consumed by renderer.
// MIDI is handled via Web MIDI in the renderer (not through IPC).
export interface ExposedApi {
  // Engine
  triggerCell: (sceneId: string, trackId: string) => Promise<void>
  stopCell: (sceneId: string, trackId: string) => Promise<void>
  // `opts.morphMs` — optional scene-to-scene morph duration in ms. When
  //   set, every cell in the scene glides over this time, and any tracks
  //   active from the previous scene that don't exist in this one fade
  //   out over the same duration.
  // `opts.sourceSlotIdx` — slot index (0-based into session.sequence) the
  //   trigger originated from. Sequence view uses it to highlight the
  //   specific slot that fired when a scene is placed multiple times.
  triggerScene: (
    sceneId: string,
    opts?: { morphMs?: number; sourceSlotIdx?: number | null }
  ) => Promise<void>
  stopScene: (sceneId: string) => Promise<void>
  stopAll: () => Promise<void>
  panic: () => Promise<void>
  pauseSequence: () => Promise<void>
  resumeSequence: () => Promise<void>
  setTickRate: (hz: number) => Promise<void>
  updateSession: (session: Session) => Promise<void>
  // Meta Controller live output — continuous while the user drags a knob.
  // Renderer sends the normalized 0..1 position; main scales via the knob's
  // min/max/curve (fetched from the last pushed session) and blasts OSC to
  // every enabled destination.
  sendMetaValue: (knobIndex: number, normalizedValue: number) => Promise<void>
  // Session I/O
  sessionSaveAs: (session: Session) => Promise<string | null> // returns filepath
  sessionSave: (session: Session, path: string) => Promise<boolean>
  sessionOpen: () => Promise<{ session: Session; path: string } | null>
  // Autosave / crash recovery
  autosaveCrashCheck: () => Promise<{ crashed: boolean; entries: AutosaveEntry[] }>
  autosaveList: () => Promise<AutosaveEntry[]>
  autosaveLoad: (path: string) => Promise<Session>
  // Events from main
  onEngineState: (cb: (s: EngineState) => void) => () => void
  // Batched outgoing OSC events (for the OSC monitor panel). Each callback
  // fire delivers a batch of messages accumulated on the main side.
  onOscEvents: (cb: (batch: OscEvent[]) => void) => () => void
  // Batched OSC send errors. Rendered as the health dot next to each
  // destination + as [ERR] rows in the OSC monitor drawer.
  onOscErrors: (cb: (batch: OscErrorEvent[]) => void) => () => void

  // ── Network discovery ────────────────────────────────────────────
  // Enable / disable the passive UDP OSC listener. Optional `port`
  // re-binds on a different inbox (default 9000). Resolves with the
  // post-action status snapshot. Bind failures surface in `lastError`
  // and `enabled` stays false.
  networkSetEnabled: (
    enabled: boolean,
    port?: number
  ) => Promise<NetworkListenerStatus>
  // Snapshot fetch — initial list + current status. Called once on
  // mount; subsequent updates arrive via `onNetworkDevices`.
  networkList: () => Promise<{
    status: NetworkListenerStatus
    devices: DiscoveredOscDevice[]
  }>
  // Wipe the device cache — useful when the user wants to re-scan
  // without restarting the app.
  networkClear: () => Promise<void>
  // Push channel — fired on a 250ms timer whenever the device map has
  // changed (new sender, new address, or fresh packet count). Status
  // is bundled in so port-rebinds and bind errors round-trip too.
  onNetworkDevices: (
    cb: (payload: {
      status: NetworkListenerStatus
      devices: DiscoveredOscDevice[]
    }) => void
  ) => () => void
}
