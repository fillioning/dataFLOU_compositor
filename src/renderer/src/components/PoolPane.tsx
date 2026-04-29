// Pool pane — middle section of the OSC-monitor drawer. Lists every
// (non-draft) Instrument Template and its Functions. Clicking selects
// (drives the Edit-view Inspector to the right side of the editor, NOT
// the drawer — Pool selection now reuses the main Inspector real-estate
// because it needs more vertical room than the drawer can provide).
//
// Templates render Reaper-style with a chevron toggle: click ▶ / ▾ to
// expand a template's Function list. Templates start COLLAPSED so the
// Pool stays scannable when the library grows. Selection itself doesn't
// auto-expand — selecting a Template just shows its Inspector.
//
// Drafts (the auto-created backing templates behind sidebar "Add
// Instrument" rows) are hidden from this list — they only become visible
// after the user runs "Save as Template".

import { useState } from 'react'
import { useStore } from '../store'
import type { InstrumentTemplate, InstrumentFunction } from '@shared/types'

// MIME types for the HTML5 drag-and-drop handoff. Both shapes are
// JSON-encoded into the dataTransfer payload; the drop target picks the
// one it cares about. Custom types so a stray drag from somewhere else
// can't accidentally land in our drop zones.
export const POOL_TEMPLATE_DRAG_MIME = 'application/x-dataflou-pool-template'
export const POOL_FUNCTION_DRAG_MIME = 'application/x-dataflou-pool-function'

export interface PoolTemplateDragPayload {
  templateId: string
}
export interface PoolFunctionDragPayload {
  templateId: string
  functionId: string
}

export default function PoolPane(): JSX.Element {
  const allTemplates = useStore((s) => s.session.pool.templates)
  const selection = useStore((s) => s.poolSelection)
  const setSelection = useStore((s) => s.setPoolSelection)
  const addTemplate = useStore((s) => s.addTemplate)
  const addFunction = useStore((s) => s.addFunctionToTemplate)
  const removeTemplate = useStore((s) => s.removeTemplate)
  const removeFunction = useStore((s) => s.removeFunction)
  const duplicateTemplate = useStore((s) => s.duplicateTemplate)
  // Drafts back the live "Add Instrument" sidebar rows; keep them out
  // of the Pool browser until the user explicitly Saves-as-Template.
  const templates = allTemplates.filter((t) => !t.draft)

  // Per-template expand/collapse — local UI state, not persisted. By
  // default everything is COLLAPSED; you click the chevron to peek
  // inside a template's Function list. Selection (clicking the header
  // body) is independent — it doesn't auto-expand.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  function toggleExpand(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border shrink-0">
        <span className="label">Pool</span>
        <span className="text-muted text-[10px]">{templates.length}</span>
        <div className="flex-1" />
        <button
          className="btn text-[10px] py-0.5"
          onClick={() => addTemplate()}
          title="Create a new empty Template"
        >
          + Template
        </button>
      </div>

      {/* Body — scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {templates.length === 0 ? (
          <div className="p-3 text-muted text-[11px]">
            No saved Templates yet. Add an Instrument from the sidebar (right-click
            → <span className="label">Add Instrument</span>) and save it as a
            Template, or click <span className="label">+ Template</span> here to
            author one from scratch.
          </div>
        ) : (
          templates.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              expanded={expanded.has(t.id)}
              onToggleExpand={() => toggleExpand(t.id)}
              selection={selection}
              onSelect={(sel) => setSelection(sel)}
              onAddFunction={() => addFunction(t.id)}
              onRemoveTemplate={() => {
                if (confirm(`Delete template "${t.name}"?`)) removeTemplate(t.id)
              }}
              onRemoveFunction={(fnId, fnName) => {
                if (confirm(`Delete function "${fnName}"?`)) removeFunction(t.id, fnId)
              }}
              onDuplicate={() => duplicateTemplate(t.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function TemplateRow({
  template,
  expanded,
  onToggleExpand,
  selection,
  onSelect,
  onAddFunction,
  onRemoveTemplate,
  onRemoveFunction,
  onDuplicate
}: {
  template: InstrumentTemplate
  expanded: boolean
  onToggleExpand: () => void
  selection: ReturnType<typeof useStore.getState>['poolSelection']
  onSelect: (
    sel: ReturnType<typeof useStore.getState>['poolSelection']
  ) => void
  onAddFunction: () => void
  onRemoveTemplate: () => void
  onRemoveFunction: (fnId: string, fnName: string) => void
  onDuplicate: () => void
}): JSX.Element {
  const isSelectedTemplate =
    selection?.kind === 'template' && selection.templateId === template.id

  function onTemplateDragStart(e: React.DragEvent): void {
    const payload: PoolTemplateDragPayload = { templateId: template.id }
    e.dataTransfer.setData(POOL_TEMPLATE_DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="flex flex-col">
      {/* Template header — parent row, drag source. */}
      <div
        draggable
        onDragStart={onTemplateDragStart}
        onClick={() => onSelect({ kind: 'template', templateId: template.id })}
        className={`relative flex items-center gap-1 px-1 py-1 cursor-grab text-[12px] ${
          isSelectedTemplate ? 'bg-panel2' : 'hover:bg-panel2/60'
        }`}
        style={{ borderLeft: `3px solid ${template.color}` }}
        title="Drag onto the Edit-view sidebar to instantiate. Click to edit in the right Inspector."
      >
        {/* Chevron — explicit toggle, never auto-expands on selection */}
        <button
          className="text-muted hover:text-text text-[10px] w-4 shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          title={expanded ? 'Collapse' : `Expand (${template.functions.length} fn)`}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="font-semibold truncate">{template.name}</span>
        {template.builtin && (
          <span
            className="text-[9px] text-muted px-1 py-0 rounded-sm border border-border shrink-0"
            title="Built-in template — clone to edit"
          >
            BUILT-IN
          </span>
        )}
        <span className="text-muted text-[10px] shrink-0">
          {template.functions.length}fn
        </span>
        <div className="flex-1" />
        <button
          className="btn text-[10px] py-0.5 px-1.5 shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
          title="Duplicate as a user-editable Template"
        >
          Dupl
        </button>
        {!template.builtin && (
          <>
            <button
              className="btn text-[10px] py-0.5 px-1.5 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                onAddFunction()
              }}
              title="Add a Function to this Template"
            >
              + Fn
            </button>
            <button
              className="btn text-[10px] py-0.5 px-1.5 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveTemplate()
              }}
              title="Delete this Template"
              style={{ borderColor: 'rgb(var(--c-danger))', color: 'rgb(var(--c-danger))' }}
            >
              ✕
            </button>
          </>
        )}
      </div>

      {/* Functions — child rows, hidden when collapsed. */}
      {expanded &&
        template.functions.map((fn) => (
          <FunctionRow
            key={fn.id}
            template={template}
            fn={fn}
            isSelected={
              selection?.kind === 'function' &&
              selection.templateId === template.id &&
              selection.functionId === fn.id
            }
            onSelect={() =>
              onSelect({
                kind: 'function',
                templateId: template.id,
                functionId: fn.id
              })
            }
            onRemove={() => onRemoveFunction(fn.id, fn.name)}
            allowRemove={!template.builtin}
          />
        ))}
    </div>
  )
}

function FunctionRow({
  template,
  fn,
  isSelected,
  onSelect,
  onRemove,
  allowRemove
}: {
  template: InstrumentTemplate
  fn: InstrumentFunction
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
  allowRemove: boolean
}): JSX.Element {
  function onFunctionDragStart(e: React.DragEvent): void {
    const payload: PoolFunctionDragPayload = {
      templateId: template.id,
      functionId: fn.id
    }
    e.dataTransfer.setData(POOL_FUNCTION_DRAG_MIME, JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'copy'
    e.stopPropagation()
  }
  return (
    <div
      draggable
      onDragStart={onFunctionDragStart}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      className={`flex items-center gap-2 pl-7 pr-1 py-0.5 cursor-grab text-[11px] ${
        isSelected ? 'bg-panel2' : 'hover:bg-panel2/60'
      }`}
      style={{ borderLeft: `3px solid ${template.color}33` }}
      title="Drag onto the Edit-view sidebar to instantiate just this Function."
    >
      <span className="truncate">{fn.name}</span>
      <span
        className="text-[9px] text-muted shrink-0 px-1 rounded-sm border border-border"
        title={`${fn.paramType.toUpperCase()} · ${fn.nature} · ${fn.streamMode}${
          fn.unit ? ` · ${fn.unit}` : ''
        }`}
      >
        {fn.paramType}
      </span>
      <div className="flex-1" />
      {allowRemove && (
        <button
          className="btn text-[10px] py-0.5 px-1.5 shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="Delete this Function"
          style={{ borderColor: 'rgb(var(--c-danger))', color: 'rgb(var(--c-danger))' }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
