import { useEffect } from 'react'
import { useStore, UI_SCALE_MAX, UI_SCALE_MIN, UI_SCALE_STEP } from './store'
import { midi } from './midi'
import TopBar from './components/TopBar'
import EditView from './components/EditView'
import MetaControllerBar from './components/MetaControllerBar'
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

  // Global Ctrl+wheel zoom for everything below the main toolbar. Scroll
  // down = zoom out (smaller), scroll up = zoom in (larger). Intercepts at
  // window level so the gesture works no matter where the cursor sits —
  // including over the zoom wrapper where a normal wheel would still
  // scroll the view. We grab state + setter via getState() so the handler
  // never needs re-registering.
  useEffect(() => {
    function onWheel(e: WheelEvent): void {
      if (!e.ctrlKey) return
      e.preventDefault()
      const cur = useStore.getState().uiScale
      const dir = e.deltaY > 0 ? -1 : 1
      const next = Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, cur + dir * UI_SCALE_STEP))
      if (next !== cur) useStore.getState().setUiScale(next)
    }
    // `passive: false` required so preventDefault actually stops any
    // browser-side Ctrl+wheel behavior.
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  // Global keyboard shortcuts.
  //   Tab           → toggle Edit ↔ Sequence
  //   Ctrl+T        → add a Message (track row)
  //   Alt+S         → add a Scene
  //   Delete / Del  → (Sequence view only) remove the focused scene
  // Shortcuts are suppressed inside text fields so typing/form-tab behave
  // normally. The other shortcuts always fire (preventDefault to override
  // browser/menu).
  const addTrack = useStore((s) => s.addTrack)
  const addScene = useStore((s) => s.addScene)
  const removeScene = useStore((s) => s.removeScene)
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
      // Delete / Del in Sequence view → remove focused scene. Guarded against
      // firing while the user is editing text (Delete in an input must act
      // on the text cursor, not the scene).
      if (e.key === 'Delete' || e.key === 'Del') {
        if (isEditableTarget(e.target)) return
        const st = useStore.getState()
        if (st.view !== 'sequence') return
        const focusedId = st.session.focusedSceneId
        if (!focusedId) return
        e.preventDefault()
        removeScene(focusedId)
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
  }, [setView, addTrack, addScene, removeScene])

  const uiScale = useStore((s) => s.uiScale)

  return (
    <div className="flex flex-col h-full">
      <TopBar />
      {/* Everything below the main toolbar lives inside a zoom wrapper so
          Ctrl+wheel rescales the whole working area (Meta Controller bar,
          Scenes, Messages, Inspector, Sequence grid) while the top toolbar
          stays at 100%. `zoom` is a Chromium-supported CSS property that
          reflows layout at the scaled factor, unlike `transform: scale`
          which would just visually squish content. */}
      <div
        className="flex flex-col flex-1 min-h-0"
        style={{ zoom: uiScale }}
      >
        <MetaControllerBar />
        <div className="flex-1 min-h-0">
          {view === 'edit' ? <EditView /> : <SequenceView />}
        </div>
      </div>
    </div>
  )
}
