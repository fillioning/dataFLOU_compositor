// 128-step drag-drop matrix + bottom transport/status bar.

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { useStore, type ThemeName } from '../store'
import type { Scene } from '@shared/types'

const THEMES: { id: ThemeName; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'pastel', label: 'Pastel' },
  { id: 'reaper', label: 'Reaper Classic' },
  { id: 'smooth', label: 'Smooth' },
  { id: 'hydra', label: 'Hydra' },
  { id: 'darkside', label: 'DarkSide' },
  { id: 'solaris', label: 'Solaris' },
  { id: 'flame', label: 'Flame' },
  { id: 'analog', label: 'Analog' }
]

export default function SequenceView(): JSX.Element {
  const scenes = useStore((s) => s.session.scenes)
  const sequence = useStore((s) => s.session.sequence)
  const sequenceLength = useStore((s) => s.session.sequenceLength)
  const setSequenceLength = useStore((s) => s.setSequenceLength)
  const setSequenceSlot = useStore((s) => s.setSequenceSlot)
  const activeSceneId = useStore((s) => s.engine.activeSceneId)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const [clearMode, setClearMode] = useState(false)
  const visible = sequence.slice(0, sequenceLength)
  const cols = Math.min(16, Math.max(1, sequenceLength))

  function handleDragEnd(e: DragEndEvent): void {
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

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full min-h-0">
        <div className="flex flex-1 min-h-0">
          {/* Palette — scenes list, plus a Theme picker at the bottom. */}
          <div className="w-[220px] shrink-0 bg-panel border-r border-border flex flex-col">
            <div className="px-3 py-2 border-b border-border label shrink-0">
              Scenes ({scenes.length})
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
              {scenes.map((s) => (
                <PaletteItem key={s.id} scene={s} />
              ))}
            </div>
            <ThemeBox />
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-auto bg-bg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="label">Scene steps</span>
              <input
                className="input w-16 text-[12px] py-0.5"
                type="number"
                min={1}
                max={128}
                step={1}
                value={sequenceLength}
                onChange={(e) => setSequenceLength(Number(e.target.value) || 1)}
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
                  active={activeSceneId === sceneId}
                  onClear={clearMode ? () => setSequenceSlot(i, null) : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        <StatusBar />
      </div>
    </DndContext>
  )
}

function StatusBar(): JSX.Element {
  const session = useStore((s) => s.session)
  const focusedSceneId = session.focusedSceneId
  const focusedScene = session.scenes.find((s) => s.id === focusedSceneId) ?? null
  const activeSceneId = useStore((s) => s.engine.activeSceneId)
  const paused = useStore((s) => s.sequencePaused)
  const setPaused = useStore((s) => s.setSequencePaused)

  const trackCountInFocused = focusedScene
    ? Object.keys(focusedScene.cells).length
    : 0

  async function onPlay(): Promise<void> {
    if (paused && activeSceneId) {
      await window.api.resumeSequence()
      setPaused(false)
      return
    }
    // Start from focused scene if present, else first non-empty sequence slot.
    let startId = focusedSceneId
    if (!startId) {
      const first = session.sequence.find((id) => !!id) ?? null
      startId = first
    }
    if (startId) {
      await window.api.triggerScene(startId)
      setPaused(false)
    }
  }

  async function onPause(): Promise<void> {
    await window.api.pauseSequence()
    setPaused(true)
  }

  async function onStop(): Promise<void> {
    await window.api.stopAll()
    setPaused(false)
  }

  return (
    <div className="border-t border-border bg-panel px-3 py-2 flex items-center gap-3 text-[12px] shrink-0">
      <div className="flex items-center gap-1">
        <button
          className="btn-accent w-8 h-7 flex items-center justify-center"
          onClick={onPlay}
          title={paused ? 'Resume' : 'Play focused scene'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <polygon points="2,1 9,5 2,9" fill="currentColor" />
          </svg>
        </button>
        <button
          className="btn w-8 h-7 flex items-center justify-center"
          onClick={onPause}
          title="Pause auto-advance (cells keep playing)"
          disabled={!activeSceneId || paused}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="2" y="1" width="2" height="8" fill="currentColor" />
            <rect x="6" y="1" width="2" height="8" fill="currentColor" />
          </svg>
        </button>
        <button
          className="btn w-8 h-7 flex items-center justify-center"
          onClick={onStop}
          title="Stop all"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="1" y="1" width="8" height="8" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="h-6 w-px bg-border" />

      <div className="flex items-center gap-2 min-w-0">
        <span className="label shrink-0">Selected</span>
        {focusedScene ? (
          <>
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: focusedScene.color }}
            />
            <span className="font-medium truncate">{focusedScene.name}</span>
            <span className="text-muted shrink-0">· {trackCountInFocused} message{trackCountInFocused === 1 ? '' : 's'}</span>
          </>
        ) : (
          <span className="text-muted">(none)</span>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-muted">
        {activeSceneId && !paused && <span className="text-accent">● playing</span>}
        {paused && <span className="text-accent2">⏸ paused</span>}
      </div>
    </div>
  )
}

function ThemeBox(): JSX.Element {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  return (
    <div className="border-t border-border bg-panel2 px-3 py-2 flex items-center gap-1.5 shrink-0">
      <span className="label shrink-0">Theme</span>
      <select
        className="input text-[11px] py-0.5 flex-1 min-w-0"
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeName)}
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function PaletteItem({ scene }: { scene: Scene }): JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `scene-${scene.id}`
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`px-2 py-1.5 rounded border cursor-grab text-[12px] ${
        isDragging ? 'opacity-50' : ''
      }`}
      style={{ borderColor: scene.color, background: scene.color + '1a' }}
    >
      <span className="font-medium">{scene.name}</span>
    </div>
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
            : () => setFocusedScene(scene.id)
          : undefined
      }
      className={`relative h-12 rounded border text-[10px] flex flex-col items-center justify-center ${
        isOver ? 'border-accent' : scene ? '' : 'border-border bg-panel/30'
      } ${active ? 'ring-2 ring-accent' : ''} ${isDragging ? 'opacity-50' : ''} ${
        onClear && scene ? 'cursor-pointer hover:brightness-75' : scene ? 'cursor-grab' : ''
      }`}
      style={scene ? { background: scene.color + '33', borderColor: scene.color } : undefined}
    >
      <div className="absolute top-0 left-0.5 text-[8px] text-muted">{index + 1}</div>
      {scene && <div className="font-medium truncate max-w-full px-1">{scene.name}</div>}
    </div>
  )
}
