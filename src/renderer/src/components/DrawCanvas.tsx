// Drawable automation curve. The user sketches a curve directly with
// the mouse on a rectangular canvas; each x-position is a step (in
// [0, drawSteps)), each y-position is a value in [0, 1]. Click+drag
// paints values along the path; the cursor switches to a crayon glyph
// while hovering the rectangle.
//
// On mount, the existing drawValues are rendered as a filled curve.
// On drag, the touched cells update via the onChange callback; the
// caller persists into cell.sequencer.drawValues.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generateDrawCurveFromValues } from '@shared/factory'

// Crayon cursor — SVG-encoded data URL so we don't need an asset
// pipeline addition. A small tilted pencil with a darkened tip; hot
// spot at the tip (8, 28) so the user draws "from the lead."
const CRAYON_SVG = [
  `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>`,
  `<g transform='rotate(35 16 16)'>`,
  // Body
  `<rect x='10' y='4' width='6' height='18' rx='1' fill='#FFB85C' stroke='#3a2400' stroke-width='1'/>`,
  // Eraser / tail band
  `<rect x='10' y='4' width='6' height='3' fill='#D17C2E' stroke='#3a2400' stroke-width='1'/>`,
  // Tip wood
  `<polygon points='10,22 16,22 13,28' fill='#E8C290' stroke='#3a2400' stroke-width='1'/>`,
  // Lead
  `<polygon points='12,25 14,25 13,28' fill='#1a1a1a'/>`,
  `</g></svg>`
].join('')
const CRAYON_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(CRAYON_SVG)}") 8 28, crosshair`

export function DrawCanvas({
  values,
  drawSteps,
  drawValueMin,
  drawValueMax,
  currentStep,
  generative,
  genAmount,
  seed,
  onChange
}: {
  values: number[] // length 1024 (padded), only first drawSteps used
  drawSteps: number // 4..1024
  /** Output range labelled on the canvas Y axis. The drawn 0..1
   *  curve maps to [drawValueMin, drawValueMax]. */
  drawValueMin: number
  drawValueMax: number
  /** Live engine step index for the playhead indicator. -1 = idle. */
  currentStep: number
  /** When true, the canvas displays the per-cycle generative curve
   *  (user's drawValues + hash jitter scaled by genAmount) instead
   *  of the static user drawing. The user's drawValues are
   *  preserved in storage; this is render-only. */
  generative: boolean
  genAmount: number
  seed: number
  onChange: (next: number[]) => void
}): JSX.Element {
  const W = 260
  const H = 100
  // Margins inside the SVG so the curve never touches the border —
  // extra padding on the left for the Y-axis labels.
  const padX = 22
  const padY = 6
  const innerW = W - padX - 4
  const innerH = H - padY * 2

  const svgRef = useRef<SVGSVGElement>(null)
  // Track which step indices were modified during the current drag,
  // so a drag that moves diagonally fills in EVERY cell it passes
  // over (not just the ones the mouse happens to be on at sample
  // time). Without this, fast diagonal drags leave gaps.
  const lastIdxRef = useRef<number | null>(null)
  const lastYRef = useRef<number | null>(null)
  const [hovering, setHovering] = useState(false)
  // Dragging state — when true AND generative is on, show the user's
  // raw drawValues instead of the generated curve so their edits are
  // visible while they paint. Release → snap back to generated.
  const [isDragging, setIsDragging] = useState(false)

  // Convert client coords → (stepIdx, value01). Pure: no state.
  const clientToStepValue = useCallback(
    (clientX: number, clientY: number): { idx: number; val: number } | null => {
      const svg = svgRef.current
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      const sx = ((clientX - rect.left) / rect.width) * W
      const sy = ((clientY - rect.top) / rect.height) * H
      const localX = sx - padX
      const localY = sy - padY
      if (localX < -padX || localX > innerW + padX) return null
      // Map x to step index in [0, drawSteps). Snap to nearest.
      const fx = Math.max(0, Math.min(innerW, localX)) / innerW
      const idx = Math.max(0, Math.min(drawSteps - 1, Math.floor(fx * drawSteps)))
      // Map y to [0, 1] with 0 at the bottom (canonical curve orientation).
      const val = Math.max(0, Math.min(1, 1 - localY / innerH))
      return { idx, val }
    },
    [W, H, innerW, innerH, drawSteps]
  )

  // Apply a value at a step idx; interpolate across any cells skipped
  // since the last sample (so fast drags don't leave gaps).
  const paint = useCallback(
    (idx: number, val: number, commit: boolean): void => {
      const next = values.slice()
      const lastIdx = lastIdxRef.current
      const lastVal = lastYRef.current
      if (lastIdx === null || lastVal === null) {
        next[idx] = val
      } else {
        // Walk every integer index between lastIdx and idx (inclusive
        // on the new side) and linearly interpolate values.
        const lo = Math.min(lastIdx, idx)
        const hi = Math.max(lastIdx, idx)
        for (let i = lo; i <= hi; i++) {
          if (hi === lo) {
            next[i] = val
            continue
          }
          // Fraction along the segment, oriented from lastIdx → idx.
          const f =
            lastIdx === idx
              ? 1
              : (i - lastIdx) / (idx - lastIdx)
          next[i] = lastVal + (val - lastVal) * f
        }
      }
      lastIdxRef.current = idx
      lastYRef.current = val
      onChange(next)
      if (commit) {
        // No special commit work — onChange is the commit. Reset
        // the segment tracker so the next drag starts fresh.
      }
    },
    [onChange, values]
  )

  // Reset segment tracker when no longer dragging.
  useEffect(() => {
    const onUp = (): void => {
      lastIdxRef.current = null
      lastYRef.current = null
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [])

  // Build the filled-curve path: a polyline through every step's
  // (x, y) point, closed at the bottom so we can fill it.
  // Cycle counter — increments when the engine wraps the playhead
  // (currentStep transitions from a high index back to 0). Used by
  // generative mode to regenerate the variation curve each cycle so
  // the visual matches what the engine emits.
  const cycleRef = useRef(0)
  const lastStepRef = useRef(currentStep)
  const [, bumpRender] = useState(0)
  useEffect(() => {
    if (currentStep < lastStepRef.current) {
      cycleRef.current = cycleRef.current + 1
      bumpRender((n) => n + 1)
    }
    lastStepRef.current = currentStep
  }, [currentStep])
  // When generative is on AND the user isn't dragging, display the
  // engine's per-cycle curve. While dragging, show the user's raw
  // drawing so their edits are visible (otherwise the cursor would
  // disagree with the displayed curve). Non-generative just shows
  // drawValues directly.
  const displayValues = useMemo(() => {
    if (!generative || isDragging) return values
    return generateDrawCurveFromValues(
      values,
      drawSteps,
      seed,
      genAmount,
      cycleRef.current
    )
  // `cycleRef.current` is a ref; React's deps array ignores refs and
  // the memo recomputes only when one of the explicit state/prop deps
  // below changes. `bumpRender` (in the parent's hook) is what forces
  // a re-render on cycle wrap so this memo re-evaluates with the
  // freshest `cycleRef.current`. Leaving cycleRef.current OUT of the
  // deps is intentional — listing it would imply React tracks it,
  // which it doesn't, and the lint rule would whine about the value
  // not changing across renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generative, isDragging, values, drawSteps, seed, genAmount])
  const cells = displayValues.slice(0, drawSteps)
  const cellW = innerW / drawSteps
  const pointPath = cells
    .map((v, i) => {
      const x = padX + i * cellW + cellW / 2
      const y = padY + (1 - v) * innerH
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
  const fillPath =
    pointPath +
    ` L ${(padX + innerW).toFixed(2)} ${(padY + innerH).toFixed(2)}` +
    ` L ${padX.toFixed(2)} ${(padY + innerH).toFixed(2)} Z`

  // Current value display — the engine emits this for the active
  // step (or step 0 at rest). Maps the drawn 0..1 curve onto the
  // user-set [drawValueMin, drawValueMax] range, matching exactly
  // what the engine sends out.
  const liveIdx = currentStep >= 0 ? currentStep % Math.max(1, drawSteps) : 0
  const liveCurve = cells[liveIdx] ?? 0
  const liveValue = drawValueMin + liveCurve * (drawValueMax - drawValueMin)
  const intRange =
    Number.isInteger(drawValueMin) &&
    Number.isInteger(drawValueMax) &&
    Math.abs(liveValue - Math.round(liveValue)) < 0.0001
  const liveValueStr = intRange
    ? String(Math.round(liveValue))
    : liveValue.toFixed(3)

  // Format the Y-axis labels (max at top, min at bottom). Same
  // integer-vs-float rule as the live readout.
  const yFmt = (v: number): string =>
    Number.isInteger(v) ? String(v) : Number(v.toFixed(2)).toString()

  // Randomize — fill drawValues with a smooth-ish random curve. Uses
  // a simple smoothed-noise generator so the result looks "drawn"
  // rather than spiky white-noise. The user can re-roll repeatedly
  // until they get a curve they like as a starting point.
  const onRandomize = useCallback((): void => {
    // Five control points, smooth-step interpolated across drawSteps.
    const ctrl = [
      Math.random(),
      Math.random(),
      Math.random(),
      Math.random(),
      Math.random()
    ]
    // Start from a zeroed buffer of the full storage length (1024)
    // so the tail beyond `drawSteps` doesn't keep stale values from
    // the previous drawing. Without this, increasing `drawSteps`
    // later would expose those stale values to the engine.
    const next = new Array(values.length).fill(0)
    for (let i = 0; i < drawSteps; i++) {
      const u = (i / Math.max(1, drawSteps - 1)) * (ctrl.length - 1)
      const lo = Math.floor(u)
      const hi = Math.min(lo + 1, ctrl.length - 1)
      const f = u - lo
      const t = f * f * (3 - 2 * f) // smoothstep
      next[i] = Math.max(0, Math.min(1, ctrl[lo] * (1 - t) + ctrl[hi] * t))
    }
    onChange(next)
  }, [drawSteps, onChange, values.length])

  return (
    <div className="flex flex-col items-center gap-1 mt-2 relative w-full">
      <span className="label">
        {generative
          ? 'Draw — generative live curve'
          : 'Draw — click + drag to sketch'}
      </span>
      <div className="relative" style={{ width: W }}>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{
          cursor: CRAYON_CURSOR,
          background: 'rgb(var(--c-input-bg) / 0.7)',
          border: '1px solid rgb(var(--c-border) / 0.7)',
          borderRadius: 6,
          touchAction: 'none',
          userSelect: 'none'
        }}
        onPointerDown={(e) => {
          ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
          const p = clientToStepValue(e.clientX, e.clientY)
          if (!p) return
          lastIdxRef.current = null
          lastYRef.current = null
          setIsDragging(true)
          paint(p.idx, p.val, false)
        }}
        onPointerMove={(e) => {
          if ((e.buttons & 1) === 0) return
          const p = clientToStepValue(e.clientX, e.clientY)
          if (!p) return
          paint(p.idx, p.val, false)
        }}
        onPointerUp={(e) => {
          ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
          setIsDragging(false)
          const p = clientToStepValue(e.clientX, e.clientY)
          if (!p) return
          paint(p.idx, p.val, true)
        }}
        onPointerCancel={() => setIsDragging(false)}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
      >
        {/* Y-axis labels — max (Y Value) at the top, min (X Value)
            at the bottom. Anchored in the left padding strip so they
            don't overlap the curve. Faint colour because they're
            reference info, not the focus. */}
        <text
          x={padX - 4}
          y={padY + 4}
          textAnchor="end"
          fontSize={9}
          fontFamily="ui-monospace, monospace"
          fill="rgb(var(--c-muted))"
        >
          {yFmt(drawValueMax)}
        </text>
        <text
          x={padX - 4}
          y={padY + innerH - 1}
          textAnchor="end"
          fontSize={9}
          fontFamily="ui-monospace, monospace"
          fill="rgb(var(--c-muted))"
        >
          {yFmt(drawValueMin)}
        </text>
        {/* Subtle vertical grid lines — only rendered when step count
            is small enough that gridlines aren't visual noise. At
            high resolutions (>128) the curve itself reads as a
            continuous line, no gridlines needed. */}
        {drawSteps <= 128 &&
          Array.from({ length: Math.max(1, Math.floor(drawSteps / 8)) }, (_, i) => {
            const x = padX + (i + 1) * 8 * cellW
            if (x >= padX + innerW - 0.1) return null
            return (
              <line
                key={i}
                x1={x}
                y1={padY}
                x2={x}
                y2={padY + innerH}
                stroke="rgb(var(--c-border) / 0.55)"
                strokeWidth={1}
              />
            )
          })}
        {/* Mid-line at value=0.5 — a faint horizontal guide. */}
        <line
          x1={padX}
          y1={padY + innerH / 2}
          x2={padX + innerW}
          y2={padY + innerH / 2}
          stroke="rgb(var(--c-border) / 0.4)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        {/* Filled curve underneath, gradient warm→cool. */}
        <defs>
          <linearGradient id="rc-draw-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(var(--c-accent))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="rgb(var(--c-accent2))" stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#rc-draw-fill)" />
        {/* Curve outline on top — keep it visible regardless of fill. */}
        <path
          d={pointPath}
          fill="none"
          stroke="rgb(var(--c-accent))"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Per-step dots — only rendered up to 64 steps; past that
            they'd be sub-pixel anyway and tank rendering perf. At
            higher resolutions only the active step gets a dot. */}
        {drawSteps <= 64 &&
          cells.map((v, i) => {
            const x = padX + i * cellW + cellW / 2
            const y = padY + (1 - v) * innerH
            const isNow = i === currentStep
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={isNow ? 3 : 1.5}
                fill={
                  isNow ? 'rgb(var(--c-accent))' : 'rgb(var(--c-text) / 0.6)'
                }
                style={{
                  filter: isNow
                    ? 'drop-shadow(0 0 4px rgb(var(--c-accent) / 0.85))'
                    : undefined,
                  transition: 'r 220ms ease-out, fill 220ms ease-out'
                }}
              />
            )
          })}
        {/* High-resolution playhead — when step count is too high for
            per-step dots, draw a single accent dot at the current
            playhead position so the user still sees the cursor.
            Modulo by drawSteps so a stale currentStep >= drawSteps
            (e.g. drawSteps shrunk mid-play) doesn't make the dot
            silently vanish. */}
        {drawSteps > 64 && currentStep >= 0 && (() => {
          const wrappedStep = currentStep % drawSteps
          return (
          <circle
            cx={padX + wrappedStep * cellW + cellW / 2}
            cy={padY + (1 - (cells[wrappedStep] ?? 0)) * innerH}
            r={3.5}
            fill="rgb(var(--c-accent))"
            style={{
              filter: 'drop-shadow(0 0 5px rgb(var(--c-accent) / 0.85))'
            }}
          />
          )
        })()}
        {/* Faint "Drag to draw" hint while hovering. */}
        {hovering && (
          <text
            x={W / 2}
            y={H - 4}
            textAnchor="middle"
            fill="rgb(var(--c-muted))"
            fontSize={9}
            fontFamily="ui-monospace, monospace"
          >
            click + drag · {drawSteps} steps
          </text>
        )}
      </svg>
      {/* Randomize button — overlayed bottom-right of the canvas.
          Fills drawValues with a smooth random curve so the user has
          a fresh starting point with one click. Re-clickable for new
          rolls. Sits on top of the SVG via absolute positioning. */}
      <button
        type="button"
        onClick={onRandomize}
        title="Fill the canvas with a fresh random smooth curve"
        className="absolute bottom-1 right-1 text-[10px] px-2 py-0.5 rounded border bg-panel2/80 hover:bg-panel2 hover:border-accent transition-colors"
        style={{
          color: 'rgb(var(--c-text))',
          borderColor: 'rgb(var(--c-border))'
        }}
      >
        Randomize
      </button>
      </div>
      {/* Current Value readout — what the engine is emitting (or
          would emit) at the active step, formatted to match the X/Y
          range type. When playing, this lights up in accent so the
          user can read it from across the panel. */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-muted">Current</span>
        <span
          className={`font-mono font-semibold ${
            currentStep >= 0 ? 'text-accent' : 'text-text'
          }`}
          style={{
            filter:
              currentStep >= 0
                ? 'drop-shadow(0 0 4px rgb(var(--c-accent) / 0.5))'
                : undefined,
            transition: 'filter 220ms ease-out'
          }}
        >
          {liveValueStr}
        </span>
        <span className="text-muted text-[10px]">
          (step {liveIdx + 1}/{drawSteps})
        </span>
      </div>
    </div>
  )
}
