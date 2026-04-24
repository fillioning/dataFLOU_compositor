// Tiny red dot rendered next to an OSC destination when it has seen a
// send failure in the last 5 seconds. The component re-renders on its
// own when the health map changes, so callers just drop `<DestHealthDot
// ip={...} port={...} />` next to the destination display and forget.

import { useOscDestHealth } from '../hooks/oscHealth'

export function DestHealthDot({
  ip,
  port,
  size = 6
}: {
  ip: string
  port: number
  /** Dot diameter in px. Defaults to 6 — enough to read without dominating. */
  size?: number
}): JSX.Element | null {
  const { failing, lastMessage, lastAt } = useOscDestHealth(ip, port)
  if (!failing) return null
  const since = lastAt ? `${((Date.now() - lastAt) / 1000).toFixed(1)}s ago` : ''
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: 'rgb(var(--c-danger))',
        boxShadow: '0 0 4px rgb(var(--c-danger) / 0.7)'
      }}
      title={`Send failure ${since}: ${lastMessage ?? 'unknown'}`}
    />
  )
}
