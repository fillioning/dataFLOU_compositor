// Rainbow-Circuit-flavoured arc slider — half-circle of N vertical
// bars with a tonal warm→cool gradient. Used by rich themes (Nature,
// Cream-as-Peaks) in place of <input type="range"> for parameters
// that benefit from a more instrument-like read: Modulation Rate,
// Sequencer Variation, etc.
//
// Click anywhere on the arc to jump to that value; click-drag to scrub.
// The active bar pumps slightly; bars left of it fill in their hue
// (interpolated between --c-rich-warm and --c-rich-cool); bars right
// of it stay dim. A small numeric readout sits below the arc.

import { useCallback, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────
// RcFlatBar — Rainbow-Circuit-flavoured but LESS theatrical than the
// arc. Horizontal gradient-fill bar with a value readout under it.
// No segmentation, no pump animation — just a clean tonal sweep that
// reflects the value. Used for parameters where the arc's footprint
// + drama was too much (Sequencer Variation specifically — the user
// asked for something more restrained).
// ─────────────────────────────────────────────────────────────────

export function RcFlatBar({
  value,
  min,
  max,
  step = 1,
  label,
  format,
  onChange,
  onCommit
}: {
  value: number
  min: number
  max: number
  step?: number
  label?: string
  format?: (v: number) => string
  onChange: (v: number) => void
  onCommit?: (v: number) => void
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const span = max - min
  const norm = span === 0 ? 0 : Math.max(0, Math.min(1, (value - min) / span))
  const setFromClient = useCallback(
    (clientX: number, commit: boolean): void => {
      const el = wrapRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const raw = min + frac * span
      const stepped = step > 0 ? Math.round(raw / step) * step : raw
      const clamped = Math.max(min, Math.min(max, stepped))
      onChange(clamped)
      if (commit && onCommit) onCommit(clamped)
    },
    [max, min, onChange, onCommit, span, step]
  )
  return (
    <div className="flex flex-col items-stretch gap-1 w-full">
      <div
        ref={wrapRef}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        onPointerDown={(e) => {
          try {
            ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
          } catch {
            /* some browsers throw on capture w/o button — ignore */
          }
          setFromClient(e.clientX, false)
        }}
        onPointerMove={(e) => {
          if ((e.buttons & 1) === 0) return
          setFromClient(e.clientX, false)
        }}
        onPointerUp={(e) => {
          // Release the capture even if pointerup fires outside the
          // element (browsers do route it back when captured). Wrap
          // in try/catch because releasing an already-released
          // pointer throws InvalidStateError in some Chromium builds.
          try {
            ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
          } catch {
            /* ignore */
          }
          setFromClient(e.clientX, true)
        }}
        // pointercancel fires when the OS yanks the pointer mid-drag
        // (touch interrupted, context menu, window blur with
        // pointer-events disabled). Treat it the same as pointerup
        // so the slider doesn't keep scrubbing on subsequent moves.
        onPointerCancel={(e) => {
          try {
            ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
          } catch {
            /* ignore */
          }
          if (onCommit) onCommit(value)
        }}
        style={{
          position: 'relative',
          height: 18,
          borderRadius: 6,
          background: 'rgb(var(--c-input-bg) / 0.7)',
          border: '1px solid rgb(var(--c-border) / 0.6)',
          cursor: 'pointer',
          userSelect: 'none',
          touchAction: 'none',
          overflow: 'hidden'
        }}
      >
        {/* Filled portion — tonal gradient warm→cool. Width scales
            smoothly with value; no pump, no scale animation. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${norm * 100}%`,
            background:
              'linear-gradient(90deg, rgb(var(--c-rich-warm)) 0%, rgb(var(--c-rich-cool)) 100%)',
            transition: 'width 180ms ease-out',
            boxShadow: 'inset 0 0 8px rgb(var(--c-rich-warm) / 0.25)'
          }}
        />
        {/* Tip indicator — thin vertical line at the fill edge so
            the eye finds the value at a glance. */}
        <div
          style={{
            position: 'absolute',
            left: `calc(${norm * 100}% - 1px)`,
            top: 1,
            bottom: 1,
            width: 2,
            borderRadius: 1,
            background: 'rgb(var(--c-rich-cool) / 0.95)',
            transition: 'left 180ms ease-out',
            boxShadow: '0 0 4px rgb(var(--c-rich-cool) / 0.45)'
          }}
        />
      </div>
      {(label || format) && (
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-muted">{label ?? ''}</span>
          <span className="text-accent">
            {format ? format(value) : String(value)}
          </span>
        </div>
      )}
    </div>
  )
}

export function RcArcSlider({
  value,
  min,
  max,
  step = 1,
  segments = 16,
  size = 86,
  label,
  format,
  onChange,
  onCommit
}: {
  value: number
  min: number
  max: number
  /** Granularity. 1 for integer, smaller for fine. */
  step?: number
  /** How many bars in the arc. 14–18 reads well. */
  segments?: number
  /** Box size in px. The arc is laid inside this square. */
  size?: number
  /** Optional label drawn under the arc. */
  label?: string
  /** Optional value formatter for the centre readout. */
  format?: (v: number) => string
  onChange: (v: number) => void
  onCommit?: (v: number) => void
}): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null)
  const span = max - min
  // Normalise to [0, 1] for the lit-fraction calc.
  const norm = span === 0 ? 0 : Math.max(0, Math.min(1, (value - min) / span))
  // Active segment index. floor + clamp so the rightmost bar lights
  // only when value === max.
  const activeIdx = Math.min(segments - 1, Math.floor(norm * segments))

  // Layout. The arc spans π → 2π (top half) inside an SVG whose
  // origin is at the bottom-centre. Each bar is a thin rectangle
  // anchored at the arc's circumference, pointing inward toward the
  // centre. Bars near the centre are positioned at angle 0 (right)
  // through angle π (left).
  const cx = size / 2
  const cy = size - 6 // baseline a few px above the SVG bottom
  const outerR = size * 0.48
  const innerR = outerR * 0.72
  const barWidth = (Math.PI * outerR) / segments * 0.6 // tangential width
  const labelY = size + 2

  // Click + drag handler — convert mouse position to a fraction of
  // the half-arc (left = 0, right = 1) and emit the corresponding
  // value. Steps are quantised on commit; while dragging the value
  // is continuous so the bar fill animates smoothly.
  const setFromClient = useCallback(
    (clientX: number, clientY: number, commit: boolean): void => {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      // Map client coords to SVG coords.
      const sx = ((clientX - rect.left) / rect.width) * size
      const sy = ((clientY - rect.top) / rect.height) * size
      const dx = sx - cx
      const dy = cy - sy // flip so up is positive
      // Angle from positive x-axis, range [0, π] for the top half.
      const ang = Math.atan2(Math.max(0, dy), dx)
      // 0 at right (ang=0), 1 at left (ang=π). Invert so the slider
      // grows left→right on screen (lower values on left).
      const frac = Math.max(0, Math.min(1, 1 - ang / Math.PI))
      const raw = min + frac * span
      const stepped = step > 0 ? Math.round(raw / step) * step : raw
      const clamped = Math.max(min, Math.min(max, stepped))
      onChange(clamped)
      if (commit && onCommit) onCommit(clamped)
    },
    [cx, cy, max, min, onChange, onCommit, size, span, step]
  )

  return (
    <svg
      ref={svgRef}
      className="rc-arc"
      width={size}
      height={size + 18}
      viewBox={`0 0 ${size} ${size + 18}`}
      style={{ overflow: 'visible' }}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      onPointerDown={(e) => {
        try {
          ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
        } catch {
          /* ignore */
        }
        setFromClient(e.clientX, e.clientY, false)
      }}
      onPointerMove={(e) => {
        if ((e.buttons & 1) === 0) return
        setFromClient(e.clientX, e.clientY, false)
      }}
      onPointerUp={(e) => {
        try {
          ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
        } catch {
          /* ignore */
        }
        setFromClient(e.clientX, e.clientY, true)
      }}
      // Treat pointercancel like up so a yanked pointer (OS gesture,
      // window blur) doesn't leave the slider in a captured-scrub
      // state with the dot still tracking.
      onPointerCancel={(e) => {
        try {
          ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
        } catch {
          /* ignore */
        }
        if (onCommit) onCommit(value)
      }}
    >
      {/* Bars laid around the top-half arc. Index 0 sits at the
          left end (ang ≈ π); index N-1 sits at the right end. */}
      {Array.from({ length: segments }, (_, i) => {
        // Centre angle of this segment: spread evenly across [π, 0].
        // i=0 → ang = π; i=N-1 → ang ≈ 0.
        const t = (i + 0.5) / segments
        const ang = Math.PI * (1 - t)
        // Outer / inner endpoints of the bar.
        const ox = cx + outerR * Math.cos(ang)
        const oy = cy - outerR * Math.sin(ang)
        const ix = cx + innerR * Math.cos(ang)
        const iy = cy - innerR * Math.sin(ang)
        // Tangent-aligned rectangle: rotate a flat rect about its
        // midpoint so its long axis points inward toward the centre.
        const midX = (ox + ix) / 2
        const midY = (oy + iy) / 2
        const len = Math.hypot(ox - ix, oy - iy)
        const rotDeg = (Math.atan2(iy - oy, ix - ox) * 180) / Math.PI
        const lit = i <= activeIdx
        const isNow = i === activeIdx
        // Hue interpolation: warm at i=0 → cool at i=N-1, using the
        // theme's --c-rich-warm / --c-rich-cool variables. Bars left
        // of the active position use this lit hue; bars to the right
        // sit at panel3 colour, dim.
        const fillVar = lit
          ? `rgb(var(--c-rich-warm) / ${1 - t * 0.55})`
          : `rgb(var(--c-panel3) / 0.9)`
        // Mix toward cool at the right end of the lit range.
        // Cheap inline gradient: linear-interpolate between warm/cool
        // by position along the active range.
        const fill = lit
          ? `color-mix(in oklab, rgb(var(--c-rich-warm)) ${(1 - t) * 100}%, rgb(var(--c-rich-cool)))`
          : fillVar
        return (
          <rect
            key={i}
            x={midX - len / 2}
            y={midY - barWidth / 2}
            width={len}
            height={barWidth}
            rx={barWidth / 2}
            ry={barWidth / 2}
            fill={fill}
            transform={`rotate(${rotDeg} ${midX} ${midY})`}
            className={`rc-arc-bar ${
              isNow ? 'is-now' : lit ? 'is-lit' : 'is-rest'
            }`}
            style={{
              filter: isNow
                ? 'drop-shadow(0 0 4px rgb(var(--c-rich-cool) / 0.85))'
                : lit
                  ? 'drop-shadow(0 0 2px rgb(var(--c-rich-warm) / 0.4))'
                  : undefined
            }}
          />
        )
      })}
      {/* Centre readout — current value, soft mono. */}
      <text x={cx} y={cy - 4} className="rc-arc-readout">
        {format ? format(value) : String(value)}
      </text>
      {/* Optional label below the arc. */}
      {label && (
        <text x={cx} y={labelY} className="rc-arc-label">
          {label}
        </text>
      )}
    </svg>
  )
}
