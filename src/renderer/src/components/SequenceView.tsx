// 128-step drag-drop matrix + bottom transport/status bar.

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { useStore } from '../store'
import { formatRemaining, useSceneCountdown } from '../hooks/useSceneCountdown'
import type { NextMode, Scene } from '@shared/types'
import { ResizeHandle } from './ResizeHandle'
import { BoundedNumberInput } from './BoundedNumberInput'

export default function SequenceView(): JSX.Element {
  const scenes = useStore((s) => s.session.scenes)
  const sequence = useStore((s) => s.session.sequence)
  const sequenceLength = useStore((s) => s.session.sequenceLength)
  const setSequenceLength = useStore((s) => s.setSequenceLength)
  const setSequenceSlot = useStore((s) => s.setSequenceSlot)
  const activeSceneId = useStore((s) => s.engine.activeSceneId)
  const activeSlotIdx = useStore((s) => s.engine.activeSequenceSlotIdx)
  const focusedSceneId = useStore((s) => s.session.focusedSceneId)
  const focusedScene = scenes.find((s) => s.id === focusedSceneId) ?? null
  const paletteWidth = useStore((s) => s.scenePaletteWidth)
  const setPaletteWidth = useStore((s) => s.setScenePaletteWidth)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const [clearMode, setClearMode] = useState(false)
  // Tracks what's currently being dragged so <DragOverlay> can render a
  // floating preview. Null when nothing is active. Strings are dnd-kit ids
  // like `scene-<id>` (palette → slot) or `slot-<N>` (slot → slot swap).
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const visible = sequence.slice(0, sequenceLength)
  const cols = Math.min(16, Math.max(1, sequenceLength))

  function handleDragStart(e: DragStartEvent): void {
    setActiveDragId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent): void {
    setActiveDragId(null)
    if (!e.over) return
    const overId = e.over.id as string
    const activeId = e.active.id as string

    const overMatch = overId.match(/^slot-(\d+)$/)
    if (!overMatch) return
    const overIdx = Number(overMatch[1])

    const slotMatch = activeId.match(/^slot-(\d+)$/)
    if (slotMatch) {
      const fromIdx = Number(slotMatch[1])
      const from = sequence[fromIdx]
      const to = sequence[overIdx]
      setSequenceSlot(fromIdx, to)
      setSequenceSlot(overIdx, from)
    } else if (activeId.startsWith('scene-')) {
      const sceneId = activeId.slice(6)
      setSequenceSlot(overIdx, sceneId)
    }
  }

  function sceneById(id: string): Scene | undefined {
    return scenes.find((s) => s.id === id)
  }

  // Resolve the currently-dragged scene (whether from the palette or a
  // sequencer slot) so we can preview it in the DragOverlay below.
  function draggedScene(): Scene | null {
    if (!activeDragId) return null
    if (activeDragId.startsWith('scene-')) {
      return sceneById(activeDragId.slice(6)) ?? null
    }
    const m = activeDragId.match(/^slot-(\d+)$/)
    if (m) {
      const sid = sequence[Number(m[1])]
      return sid ? sceneById(sid) ?? null : null
    }
    return null
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <div className="flex flex-col h-full min-h-0">
        <div className="flex flex-1 min-h-0">
          {/* Single left column holding the scene list on top and — when a
              scene is focused — its info panel directly below. User-resizable
              via the handle on the right edge (200–480 px). The sequencer
              grid sits to the right and reflows automatically. */}
          <div
            className="shrink-0 bg-panel border-r border-border flex flex-col relative"
            style={{ width: paletteWidth }}
          >
            <div className="px-3 py-2 border-b border-border label shrink-0">
              Scenes ({scenes.length})
            </div>
            {/* items-start on the flex column makes each palette pill hug
                its own text (instead of stretching to full column width).
                Short names → tiny pills, long names → wider — naturally
                adaptive per scene. */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col items-start gap-1">
              {scenes.map((s) => (
                <PaletteItem key={s.id} scene={s} focused={s.id === focusedSceneId} />
              ))}
            </div>
            {focusedScene && (
              <div className="shrink-0 border-t border-border overflow-y-auto max-h-[60%]">
                <SceneInfoPanel scene={focusedScene} />
              </div>
            )}
            {/* Drag the right edge to resize. Matches the pattern used for
                scene column width + Inspector width elsewhere. */}
            <ResizeHandle
              direction="col"
              value={paletteWidth}
              onChange={setPaletteWidth}
              min={200}
              max={480}
              className="absolute top-0 right-0 bottom-0 w-[4px] z-10"
              title="Drag to resize the Scenes panel"
            />
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-auto bg-bg p-4">
            <div data-hide-in-show="true" className="flex items-center gap-2 mb-3">
              <span className="label">Scene steps</span>
              <BoundedNumberInput
                className="input w-16 text-[12px] py-0.5"
                value={sequenceLength}
                onChange={(v) => setSequenceLength(v)}
                min={1}
                max={128}
                integer
              />
              <span className="text-muted text-[11px]">/ 128</span>
              <div className="flex-1" />
              <button
                className={`btn ${clearMode ? 'bg-danger text-black border-danger' : ''}`}
                onClick={() => setClearMode((v) => !v)}
              >
                {clearMode ? 'Click slots to clear' : 'Clear mode'}
              </button>
            </div>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(52px, 1fr))` }}
            >
              {visible.map((sceneId, i) => (
                <SlotCell
                  key={i}
                  index={i}
                  scene={sceneId ? sceneById(sceneId) : undefined}
                  // Only light up the specific slot that fired. If we
                  // don't have a source-slot (scene was fired from the
                  // palette / column / MIDI), fall back to highlighting
                  // every instance of the scene so the user can still
                  // see "this scene is playing" somewhere in the grid.
                  active={
                    activeSceneId === sceneId &&
                    (activeSlotIdx === null || activeSlotIdx === i)
                  }
                  onClear={clearMode ? () => setSequenceSlot(i, null) : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        {/* StatusBar removed — transport now lives globally at the bottom
            of App.tsx (see TransportBar) so it's also visible in Edit view. */}
      </div>

      {/* Drag preview — floats with the cursor during drag, so the user
          can see the scene they're moving before dropping it. The overlay
          is portaled by dnd-kit to document.body, so it doesn't get
          clipped by the column / grid overflow. */}
      <DragOverlay dropAnimation={null}>
        {(() => {
          const s = draggedScene()
          if (!s) return null
          return (
            <div
              className="px-2 py-1.5 rounded border text-[12px] font-medium shadow-lg cursor-grabbing"
              style={{
                borderColor: s.color,
                background: s.color + '44',
                color: 'rgb(var(--c-text))',
                minWidth: 140
              }}
            >
              {s.name}
            </div>
          )
        })()}
      </DragOverlay>
    </DndContext>
  )
}

function PaletteItem({ scene, focused }: { scene: Scene; focused: boolean }): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `scene-${scene.id}`
  })
  const setFocusedScene = useStore((s) => s.setFocusedScene)
  const selectSceneRange = useStore((s) => s.selectSceneRange)
  const selectedSceneIds = useStore((s) => s.selectedSceneIds)
  const isArmed = useStore((s) => s.armedSceneId === scene.id)
  // Live countdown while this pill is the engine's active scene.
  const { active, remainingMs, progress } = useSceneCountdown(scene.id, scene.durationSec)
  // Highlight if part of the multi-selection (same logic as SceneColumn).
  const inMulti = selectedSceneIds.length > 0 && selectedSceneIds.includes(scene.id)
  const highlighted = inMulti || (selectedSceneIds.length === 0 && focused)
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Alt-click arms this scene as the next cue (toggle).
        if (e.altKey) {
          const cur = useStore.getState().armedSceneId
          useStore.getState().setArmedSceneId(cur === scene.id ? null : scene.id)
          return
        }
        // Shift-click extends the multi-selection from the current anchor.
        if (e.shiftKey) selectSceneRange(scene.id)
        else setFocusedScene(scene.id)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        const cur = useStore.getState().armedSceneId
        useStore.getState().setArmedSceneId(cur === scene.id ? null : scene.id)
      }}
      className={`relative px-2 py-1.5 rounded border cursor-pointer text-[12px] overflow-hidden ${
        isDragging ? 'opacity-50 cursor-grab' : ''
      } ${highlighted ? 'ring-2 ring-accent' : ''}`}
      // A scene inside the multi-selection gets a deeper tint so the set
      // reads at a glance in the palette.
      style={{
        borderColor: scene.color,
        background: scene.color + (highlighted ? '33' : '1a')
      }}
      title="Click: select · Shift-click: extend · Alt-click / right-click: arm as next cue"
    >
      {isArmed && <div className="armed-ring absolute inset-0 pointer-events-none" />}
      {isArmed && <span className="armed-chevron" aria-hidden>▶▶</span>}
      {/* Scene-duration progress strip along the bottom edge of the pill.
          Only rendered while this scene is actively playing. Accent orange
          matches the trigger-square "playing" color. Thin (2 px) so it
          doesn't compete with the armed-ring (blue) visually. */}
      {active && (
        <div
          className="absolute left-0 bottom-0 h-[2px] pointer-events-none"
          style={{
            width: `${progress * 100}%`,
            background: 'rgb(var(--c-accent))',
            transition: 'width 50ms linear'
          }}
          aria-hidden
        />
      )}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-medium truncate flex-1">{scene.name}</span>
        {active && (
          <span
            className="text-[10px] font-mono tabular-nums text-accent shrink-0"
            title="Time remaining in this scene's duration"
          >
            {formatRemaining(remainingMs)}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Scene info / edit panel. Shown in the Sequence view when a scene is focused
 * (clicked in the palette or in a sequencer slot). Lets the user edit name /
 * color / notes / duration / nextMode and delete the scene. Pressing the
 * Delete key with the view focused on a scene (handled in App.tsx globally)
 * also deletes the scene.
 */
function SceneInfoPanel({ scene }: { scene: Scene }): JSX.Element {
  const updateScene = useStore((s) => s.updateScene)
  const removeScene = useStore((s) => s.removeScene)
  const showMode = useStore((s) => s.showMode)
  const messageCount = Object.keys(scene.cells).length
  const nextModes: { id: NextMode; label: string }[] = [
    { id: 'stop', label: 'Stop' },
    { id: 'loop', label: 'Loop' },
    { id: 'next', label: 'Next' },
    { id: 'prev', label: 'Previous' },
    { id: 'first', label: 'First' },
    { id: 'last', label: 'Last' },
    { id: 'any', label: 'Any' },
    { id: 'other', label: 'Other' }
  ]
  return (
    <fieldset
      disabled={showMode}
      className="p-3 flex flex-col gap-3 text-[12px] border-0 m-0 min-w-0"
    >
      <div className="flex items-center justify-between">
        <span className="label">Scene</span>
        {!showMode && (
          <button
            className="btn text-[11px] py-0.5"
            style={{ borderColor: 'rgb(var(--c-danger))', color: 'rgb(var(--c-danger))' }}
            onClick={() => {
              if (confirm(`Delete scene "${scene.name}"? This cannot be undone.`)) {
                removeScene(scene.id)
              }
            }}
            title="Delete scene (or press Delete key)"
          >
            Delete
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          className="w-7 h-7 rounded border border-border bg-transparent cursor-pointer shrink-0"
          value={scene.color}
          onChange={(e) => updateScene(scene.id, { color: e.target.value })}
          title="Scene color"
        />
        <input
          className="input flex-1 min-w-0 text-[13px] font-medium"
          value={scene.name}
          onChange={(e) => updateScene(scene.id, { name: e.target.value })}
          placeholder="Scene name"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="label">Notes</span>
        <textarea
          className="input text-[12px] resize-none"
          rows={3}
          value={scene.notes}
          onChange={(e) => updateScene(scene.id, { notes: e.target.value })}
          placeholder="Free-form notes"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="label">Dur</span>
          <BoundedNumberInput
            className="input w-16 text-[12px] py-0.5"
            value={scene.durationSec}
            onChange={(v) => updateScene(scene.id, { durationSec: v })}
            min={0.5}
            max={300}
          />
          <span className="text-muted text-[11px]">s</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="label">Next</span>
          <select
            className="input text-[12px] py-0.5 min-w-[96px]"
            value={scene.nextMode}
            onChange={(e) => updateScene(scene.id, { nextMode: e.target.value as NextMode })}
          >
            {nextModes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* Multiplicator — only exposed here (Sequence-tab inspector) per
            the design. Engine replays the scene this many times before the
            follow action fires. 1 = classic behavior (advance after one play). */}
        <div className="flex items-center gap-1.5">
          <span className="label" title="How many times the scene plays before Next triggers">
            ×
          </span>
          <BoundedNumberInput
            className="input w-12 text-[12px] py-0.5"
            value={scene.multiplicator}
            onChange={(v) => updateScene(scene.id, { multiplicator: v })}
            min={1}
            max={128}
            integer
            title="Multiplicator: how many times the scene plays before the follow action fires (1–128)"
          />
        </div>
      </div>

      {/* Per-scene Morph-in override. Leave blank (empty field) to fall
          back to the transport-level Morph; set a number (incl. 0) to
          pin THIS scene's glide-in duration regardless of transport. */}
      <div className="flex items-center gap-2">
        <span
          className="label"
          title="Morph-in: when this scene is triggered, glide every cell over this duration. Overrides the transport Morph setting. Leave blank to follow transport."
        >
          Morph-in
        </span>
        <input
          className="input w-20 text-[12px] py-0.5"
          type="text"
          inputMode="numeric"
          placeholder="(transport)"
          value={scene.morphInMs !== undefined ? String(scene.morphInMs) : ''}
          onChange={(e) => {
            const raw = e.target.value.trim()
            if (raw === '') {
              updateScene(scene.id, { morphInMs: undefined })
              return
            }
            const n = Number(raw)
            if (!Number.isFinite(n)) return
            updateScene(scene.id, {
              morphInMs: Math.max(0, Math.min(300000, Math.floor(n)))
            })
          }}
        />
        <span className="text-muted text-[11px]">ms</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="label">Messages</span>
        <span className="text-muted">
          {messageCount} message{messageCount === 1 ? '' : 's'} defined
        </span>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span>Tip: switch to the Edit view (Tab) to edit this scene's clips.</span>
      </div>
    </fieldset>
  )
}

function SlotCell({
  index,
  scene,
  active,
  onClear
}: {
  index: number
  scene: Scene | undefined
  active: boolean
  onClear?: () => void
}): JSX.Element {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot-${index}` })
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging
  } = useDraggable({ id: `slot-${index}`, disabled: !scene })
  const setFocusedScene = useStore((s) => s.setFocusedScene)
  const selectSceneRange = useStore((s) => s.selectSceneRange)
  const isArmed = useStore((s) => !!scene && s.armedSceneId === scene.id)

  function setRef(n: HTMLDivElement | null): void {
    setDropRef(n)
    setDragRef(n)
  }

  return (
    <div
      ref={setRef}
      {...(scene ? attributes : {})}
      {...(scene ? listeners : {})}
      onClick={
        scene
          ? onClear
            ? onClear
            : (e) => {
                // Alt-click arms the scene occupying this slot.
                if (e.altKey) {
                  const cur = useStore.getState().armedSceneId
                  useStore.getState().setArmedSceneId(cur === scene.id ? null : scene.id)
                  return
                }
                // Shift-click extends the scene multi-selection from the
                // anchor — handy for bulk operations from the grid too.
                if (e.shiftKey) selectSceneRange(scene.id)
                else setFocusedScene(scene.id)
              }
          : undefined
      }
      onContextMenu={
        scene
          ? (e) => {
              e.preventDefault()
              const cur = useStore.getState().armedSceneId
              useStore.getState().setArmedSceneId(cur === scene.id ? null : scene.id)
            }
          : undefined
      }
      title={
        scene
          ? 'Click: focus · Shift-click: extend selection · Alt-click / right-click: arm as next cue'
          : undefined
      }
      className={`relative h-12 rounded border text-[10px] flex flex-col items-center justify-center ${
        isOver ? 'border-accent' : scene ? '' : 'border-border bg-panel/30'
      } ${active ? 'ring-2 ring-accent' : ''} ${isDragging ? 'opacity-50' : ''} ${
        onClear && scene ? 'cursor-pointer hover:brightness-75' : scene ? 'cursor-grab' : ''
      }`}
      style={scene ? { background: scene.color + '33', borderColor: scene.color } : undefined}
    >
      {isArmed && <div className="armed-ring absolute inset-0 pointer-events-none" />}
      {isArmed && <span className="armed-chevron" aria-hidden>▶▶</span>}
      <div className="absolute top-0 left-0.5 text-[8px] text-muted">{index + 1}</div>
      {scene && <div className="font-medium truncate max-w-full px-1">{scene.name}</div>}
    </div>
  )
}
