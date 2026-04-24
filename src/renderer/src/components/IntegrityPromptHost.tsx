// Thin wrapper that mounts the IntegrityPrompt modal when the store's
// `pendingIntegrityLoad` is non-null. Lives once at the App root so any
// code path calling `requestSessionLoad(...)` triggers the same UX.

import { useStore } from '../store'
import { IntegrityPrompt } from './IntegrityPrompt'

export function IntegrityPromptHost(): JSX.Element | null {
  const pending = useStore((s) => s.pendingIntegrityLoad)
  const resolve = useStore((s) => s.resolveIntegrityLoad)
  if (!pending) return null
  return (
    <IntegrityPrompt
      session={pending.session}
      issues={pending.issues}
      onLoad={(s) => resolve(s)}
      onCancel={() => resolve(null)}
    />
  )
}
