import { useEffect } from 'react'
import { useStore } from './store'
import { midi } from './midi'
import TopBar from './components/TopBar'
import EditView from './components/EditView'
import SequenceView from './components/SequenceView'

export default function App(): JSX.Element {
  const session = useStore((s) => s.session)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const setEngineState = useStore((s) => s.setEngineState)
  const theme = useStore((s) => s.theme)

  // Apply theme at the document root so CSS variables cascade everywhere.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Push session to engine whenever it changes.
  useEffect(() => {
    window.api.updateSession(session)
  }, [session])

  // Subscribe to engine state events.
  useEffect(() => {
    const off = window.api.onEngineState((s) => setEngineState(s))
    return off
  }, [setEngineState])

  // Init MIDI once.
  useEffect(() => {
    midi.init()
  }, [])

  // Global keyboard shortcuts.
  //   Tab        → toggle Edit ↔ Sequence
  //   Ctrl+T     → add a Message (track row)
  //   Alt+S      → add a Scene
  // Tab is suppressed inside text fields so form-tab navigation keeps working.
  // The other shortcuts always fire (preventDefault to override browser/menu).
  const addTrack = useStore((s) => s.addTrack)
  const addScene = useStore((s) => s.addScene)
  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null
      const tag = el?.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el?.isContentEditable === true
      )
    }
    function onKey(e: KeyboardEvent): void {
      // Ctrl/Cmd + T → add Message
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        addTrack()
        return
      }
      // Alt + S → add Scene
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        addScene()
        return
      }
      // Tab → toggle view
      if (e.key === 'Tab') {
        if (isEditableTarget(e.target)) return
        e.preventDefault()
        setView(useStore.getState().view === 'edit' ? 'sequence' : 'edit')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setView, addTrack, addScene])

  return (
    <div className="flex flex-col h-full">
      <TopBar />
      <div className="flex-1 min-h-0">
        {view === 'edit' ? <EditView /> : <SequenceView />}
      </div>
    </div>
  )
}
