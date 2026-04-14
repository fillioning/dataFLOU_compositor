import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { LfoShape, SeqSyncMode } from '@shared/types'
import { BoundedNumberInput } from './BoundedNumberInput'

export default function Inspector({ mode }: { mode: 'cell' | 'track' }): JSX.Element {
  if (mode === 'track') return <TrackInspector />
  return <CellInspector />
}

function TrackInspector(): JSX.Element {
  const trackId = useStore((s) => s.selectedTrack)!
  const track = useStore((s) => s.session.tracks.find((t) => t.id === trackId))
  const renameTrack = useStore((s) => s.renameTrack)
  const setTrackDefaults = useStore((s) => s.setTrackDefaults)
  const sendTrackDefaultsToClips = useStore((s) => s.sendTrackDefaultsToClips)
  const scenesCount = useStore((s) => s.session.scenes.length)
  const cellsCount = useStore((s) =>
    s.session.scenes.reduce((n, sc) => n + (sc.cells[trackId] ? 1 : 0), 0)
  )

  if (!track) return <div className="p-4 text-muted text-[12px]">Message removed.</div>

  return (
    <div className="p-3 flex flex-col gap-3 text-[12px]">
      <Section title="Message name">
        <input
          className="input w-full"
          value={track.name}
          onChange={(e) => renameTrack(trackId, e.target.value)}
          placeholder="Message name"
        />
      </Section>

      <Section title="Message default destination">
        <div className="flex gap-1 items-center">
          <input
            className="input flex-1"
            value={track.defaultDestIp ?? ''}
            placeholder="(inherit)"
            onChange={(e) =>
              setTrackDefaults(trackId, { defaultDestIp: e.target.value || undefined })
            }
          />
          <span className="text-muted">:</span>
          <input
            className="input w-20"
            type="number"
            min={0}
            max={65535}
            placeholder="port"
            value={track.defaultDestPort ?? ''}
            onChange={(e) =>
              setTrackDefaults(trackId, {
                defaultDestPort: e.target.value === '' ? undefined : Number(e.target.value)
              })
            }
          />
        </div>
      </Section>

      <Section title="Message default OSC address">
        <input
          className="input w-full"
          value={track.defaultOscAddress ?? ''}
          placeholder="(inherit)"
          onChange={(e) =>
            setTrackDefaults(trackId, { defaultOscAddress: e.target.value || undefined })
          }
        />
      </Section>

      <button
        className="btn-accent"
        onClick={() => {
          if (cellsCount === 0) return
          if (
            confirm(
              `Apply this message's defaults to all ${cellsCount} clip(s) on this message? Overwrites existing values.`
            )
          )
            sendTrackDefaultsToClips(trackId)
        }}
        disabled={cellsCount === 0}
      >
        Send to clips ({cellsCount}/{scenesCount})
      </button>

      <div className="text-[10px] text-muted leading-snug">
        Only fields with a value get sent. Leave a field blank to skip it.
      </div>
    </div>
  )
}

function CellInspector(): JSX.Element {
  const sel = useStore((s) => s.selectedCell)!
  const scene = useStore((s) => s.session.scenes.find((sc) => sc.id === sel.sceneId))
  const track = useStore((s) => s.session.tracks.find((t) => t.id === sel.trackId))
  const cell = scene?.cells[sel.trackId]
  const updateCell = useStore((s) => s.updateCell)
  const setAddressToDefault = useStore((s) => s.setAddressToDefault)
  const setDestToDefault = useStore((s) => s.setDestToDefault)
  const currentStep = useStore(
    (s) => s.engine.seqStepBySceneAndTrack[sel.sceneId]?.[sel.trackId]
  )

  if (!scene || !track || !cell) {
    return <div className="p-4 text-muted text-[12px]">Cell removed.</div>
  }
  const c = cell

  function u(patch: Partial<typeof c>): void {
    updateCell(sel.sceneId, sel.trackId, patch)
  }
  function uSeq(patch: Partial<typeof c.sequencer>): void {
    u({ sequencer: { ...c.sequencer, ...patch } })
  }

  return (
    <div className="p-3 flex flex-col gap-3 text-[12px]">
      <div>
        <div className="label mb-1">Cell</div>
        <div className="text-[11px]">
          <span className="text-muted">{scene.name} → {track.name}</span>
        </div>
      </div>

      <Section title="Destination">
        <div className="flex gap-1 items-center">
          <input
            className="input flex-1 min-w-0"
            value={cell.destIp}
            onChange={(e) => u({ destIp: e.target.value })}
            placeholder="IP"
            maxLength={15}
          />
          <span className="text-muted">:</span>
          <input
            className="input w-12"
            type="text"
            inputMode="numeric"
            value={String(cell.destPort)}
            onChange={(e) => {
              const v = e.target.value
              if (!/^\d*$/.test(v)) return
              const n = v === '' ? 0 : parseInt(v, 10)
              if (Number.isFinite(n) && n <= 65535) u({ destPort: n })
            }}
            placeholder="port"
          />
          {cell.destLinkedToDefault ? (
            <span className="chip text-accent2 shrink-0">~def~</span>
          ) : (
            <button
              className="btn text-[10px] px-1.5 py-0.5 shrink-0"
              onClick={() => setDestToDefault(sel.sceneId, sel.trackId)}
            >
              Default
            </button>
          )}
        </div>
      </Section>

      <Section title="OSC Address">
        <div className="flex gap-1 items-center">
          <input
            className="input flex-1 min-w-0"
            value={cell.oscAddress}
            onChange={(e) => u({ oscAddress: e.target.value })}
            placeholder="/path"
          />
          {cell.addressLinkedToDefault ? (
            <span className="chip text-accent2 shrink-0">~def~</span>
          ) : (
            <button
              className="btn text-[10px] px-1.5 py-0.5 shrink-0"
              onClick={() => setAddressToDefault(sel.sceneId, sel.trackId)}
            >
              Default
            </button>
          )}
        </div>
      </Section>

      <Section title="Value">
        <input
          className="input w-full font-mono"
          value={cell.value}
          onChange={(e) => u({ value: e.target.value })}
          placeholder="0"
          disabled={cell.sequencer.enabled}
        />
        <div className="text-[10px] text-muted mt-1">
          auto-detected: {detectedLabel(cell.value)}
          {cell.sequencer.enabled && (
            <span className="text-accent ml-2">(ignored — sequencer on)</span>
          )}
        </div>
      </Section>

      <Section title="Timing">
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1 items-center">
          <span className="label">Delay</span>
          <input
            className="input"
            type="number"
            min={0}
            max={10000}
            step={10}
            value={cell.delayMs}
            onChange={(e) => u({ delayMs: clamp(Number(e.target.value), 0, 10000) })}
          />
          <span className="text-muted text-[11px]">ms</span>
          <span className="label">Transition</span>
          <input
            className="input"
            type="number"
            min={0}
            max={10000}
            step={10}
            value={cell.transitionMs}
            onChange={(e) => u({ transitionMs: clamp(Number(e.target.value), 0, 10000) })}
          />
          <span className="text-muted text-[11px]">ms</span>
        </div>
      </Section>

      <CollapsibleSection
        title="Modulation"
        enabled={cell.modulation.enabled}
        onToggle={(v) => u({ modulation: { ...cell.modulation, enabled: v } })}
      >
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1 items-center">
          <span className="label">Shape</span>
          <select
            className="input"
            value={cell.modulation.shape}
            onChange={(e) =>
              u({ modulation: { ...cell.modulation, shape: e.target.value as LfoShape } })
            }
          >
            <option value="sine">Sine</option>
            <option value="triangle">Triangle</option>
            <option value="sawtooth">Sawtooth</option>
            <option value="square">Square</option>
            <option value="rndStep">Random Stepped</option>
            <option value="rndSmooth">Random Smoothed</option>
          </select>
          <span />

          <span className="label">Depth</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={cell.modulation.depthPct}
            onChange={(e) =>
              u({
                modulation: {
                  ...cell.modulation,
                  depthPct: clamp(Number(e.target.value), 0, 100)
                }
              })
            }
          />
          <input
            className="input w-14 text-right"
            type="number"
            min={0}
            max={100}
            step={1}
            value={cell.modulation.depthPct}
            onChange={(e) =>
              u({
                modulation: {
                  ...cell.modulation,
                  depthPct: clamp(Number(e.target.value), 0, 100)
                }
              })
            }
          />

          <span className="label">Rate</span>
          <input
            type="range"
            min={0.01}
            max={10}
            step={0.01}
            value={cell.modulation.rateHz}
            onChange={(e) =>
              u({
                modulation: {
                  ...cell.modulation,
                  rateHz: clamp(Number(e.target.value), 0.01, 10)
                }
              })
            }
          />
          <BoundedNumberInput
            className="input w-14 text-right"
            min={0.01}
            max={10}
            value={cell.modulation.rateHz}
            onChange={(v) => u({ modulation: { ...cell.modulation, rateHz: v } })}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Sequencer"
        enabled={cell.sequencer.enabled}
        onToggle={(v) => uSeq({ enabled: v })}
      >
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1 items-center">
          <span className="label">Steps</span>
          <input
            type="range"
            min={1}
            max={16}
            step={1}
            value={cell.sequencer.steps}
            onChange={(e) => uSeq({ steps: clamp(Math.round(Number(e.target.value)), 1, 16) })}
          />
          <input
            className="input w-14 text-right"
            type="number"
            min={1}
            max={16}
            step={1}
            value={cell.sequencer.steps}
            onChange={(e) => uSeq({ steps: clamp(Math.round(Number(e.target.value)), 1, 16) })}
          />

          <span className="label">Mode</span>
          <select
            className="input col-span-2"
            value={cell.sequencer.syncMode}
            onChange={(e) => {
              const mode = e.target.value as SeqSyncMode
              if (mode === 'free') {
                uSeq({ syncMode: 'free', stepMs: Math.round(60000 / cell.sequencer.bpm) })
              } else {
                uSeq({
                  syncMode: 'sync',
                  bpm: clamp(Math.round(60000 / Math.max(1, cell.sequencer.stepMs)), 10, 500)
                })
              }
            }}
          >
            <option value="sync">Sync (BPM)</option>
            <option value="free">Free (ms)</option>
          </select>

          {cell.sequencer.syncMode === 'sync' ? (
            <>
              <span className="label">Tempo</span>
              <input
                type="range"
                min={10}
                max={500}
                step={1}
                value={cell.sequencer.bpm}
                onChange={(e) => uSeq({ bpm: clamp(Number(e.target.value), 10, 500) })}
              />
              <input
                className="input w-14 text-right"
                type="number"
                min={10}
                max={500}
                step={1}
                value={cell.sequencer.bpm}
                onChange={(e) => uSeq({ bpm: clamp(Number(e.target.value), 10, 500) })}
              />
            </>
          ) : (
            <>
              <span className="label">Step</span>
              <input
                type="range"
                min={10}
                max={5000}
                step={10}
                value={Math.min(5000, cell.sequencer.stepMs)}
                onChange={(e) => uSeq({ stepMs: clamp(Number(e.target.value), 1, 60000) })}
              />
              <input
                className="input w-16 text-right"
                type="number"
                min={1}
                max={60000}
                step={1}
                value={cell.sequencer.stepMs}
                onChange={(e) => uSeq({ stepMs: clamp(Number(e.target.value), 1, 60000) })}
              />
            </>
          )}
        </div>

        <div className="mt-2 flex flex-col gap-1">
          <div className="label">Step values (1…{cell.sequencer.steps})</div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: cell.sequencer.steps }, (_, i) => (
              <StepInput
                key={i}
                index={i}
                active={currentStep === i && cell.sequencer.enabled}
                value={cell.sequencer.stepValues[i] ?? ''}
                onChange={(v) => {
                  const next = [...cell.sequencer.stepValues]
                  next[i] = v
                  uSeq({ stepValues: next })
                }}
              />
            ))}
          </div>
          <div className="text-[10px] text-muted mt-1">
            Auto-detect per step (bool / int / float / string). With Modulation also on, the LFO
            oscillates around the current step value.
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 pt-2 border-t border-border first:border-t-0 first:pt-0">
      <div className="label">{title}</div>
      {children}
    </div>
  )
}

// Shows only the enable checkbox when disabled; expands to reveal children when on.
function CollapsibleSection({
  title,
  enabled,
  onToggle,
  children
}: {
  title: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1 pt-2 border-t border-border">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="label">{title}</span>
        {!enabled && <span className="text-[10px] text-muted">(click to enable)</span>}
      </label>
      {enabled && <div className="flex flex-col gap-2 mt-1">{children}</div>}
    </div>
  )
}

// A step input that pulses orange each time it becomes the active step.
// Uncontrolled (defaultValue + ref): the DOM owns the value while focused, so
// engine state updates (which fire at sequencer rate) cannot clobber typing.
// External value changes are synced into the DOM only when the input is not
// focused. Auto-selects on focus so typing replaces the existing value (e.g. "0").
function StepInput({
  index,
  active,
  value,
  onChange
}: {
  index: number
  active: boolean
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const pulseRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    if (document.activeElement !== el && el.value !== value) {
      el.value = value
    }
  }, [value])

  useEffect(() => {
    if (!active) return
    const el = pulseRef.current
    if (!el) return
    el.classList.remove('seq-pulse')
    void el.offsetWidth
    el.classList.add('seq-pulse')
  }, [active])

  return (
    <div className="relative">
      <span className="text-[9px] text-muted px-1">{index + 1}</span>
      <input
        ref={inputRef}
        defaultValue={value}
        className={`input text-[11px] py-0.5 px-1 font-mono w-full ${active ? 'border-accent' : ''}`}
        placeholder="–"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value)}
      />
      <div
        ref={pulseRef}
        aria-hidden
        className="absolute inset-x-0 bottom-0 top-[14px] pointer-events-none rounded-sm"
      />
    </div>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return v < lo ? lo : v > hi ? hi : v
}

function detectedLabel(s: string): string {
  const t = s.trim()
  if (t === '') return 'string (empty)'
  if (/^(true|TRUE|True|false|FALSE|False)$/.test(t)) return 'bool'
  if (/^-?\d+$/.test(t)) return 'int'
  if (/^-?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(t)) return 'float'
  return 'string'
}
