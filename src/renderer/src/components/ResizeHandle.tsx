// A thin draggable strip that updates a numeric value as the user drags.
// Used for row height, column width, and inspector width.

import { useCallback } from 'react'

interface Props {
  direction: 'row' | 'col' // 'row' resizes vertically (height); 'col' horizontally (width)
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  // Inverse drag — when the handle is on the left edge, dragging right *decreases* the
  // panel width (because it shrinks toward the right). Set to true for right-anchored
  // panels (e.g., Inspector on the right side).
  inverse?: boolean
  className?: string
  title?: string
}

export function ResizeHandle({
  direction,
  value,
  onChange,
  min = 0,
  max = 10000,
  inverse = false,
  className = '',
  title
}: Props): JSX.Element {
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startCoord = direction === 'row' ? e.clientY : e.clientX
      const startValue = value
      const onMove = (ev: MouseEvent): void => {
        const cur = direction === 'row' ? ev.clientY : ev.clientX
        let delta = cur - startCoord
        if (inverse) delta = -delta
        const next = Math.max(min, Math.min(max, startValue + delta))
        onChange(next)
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [direction, inverse, min, max, onChange, value]
  )

  return (
    <div
      className={`${direction === 'row' ? 'resize-h' : 'resize-v'} ${className}`}
      onMouseDown={onMouseDown}
      title={title}
    />
  )
}
