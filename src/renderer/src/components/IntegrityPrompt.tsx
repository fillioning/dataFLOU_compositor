// Modal shown when a session is being loaded (via Open dialog or crash
// recovery) and the integrity scan found problems. The user can
// auto-fix every issue at once, load anyway (accept the weirdness), or
// cancel and leave the current session in place.
//
// Errors (severity='error') block the "Load anyway" button — the user
// has to pick Auto-fix or Cancel. Warnings never block.

import type { Session } from '@shared/types'
import { Modal } from './Modal'
import type { IntegrityIssue } from '../hooks/sessionIntegrity'
import { applyFixes } from '../hooks/sessionIntegrity'

export function IntegrityPrompt({
  session,
  issues,
  onLoad,
  onCancel
}: {
  session: Session
  issues: IntegrityIssue[]
  /** Fired with the session to actually commit (raw or auto-fixed). */
  onLoad: (s: Session) => void
  onCancel: () => void
}): JSX.Element {
  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warnCount = issues.length - errorCount

  return (
    <Modal
      title={`Session has ${issues.length} issue${issues.length === 1 ? '' : 's'}`}
      onClose={onCancel}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-muted">
          This session was opened successfully but some fields look off. You
          can auto-fix them all, load anyway, or cancel.
        </p>
        <div className="flex items-center gap-3 text-[11px]">
          {errorCount > 0 && (
            <span className="text-danger">
              ⚠ {errorCount} error{errorCount === 1 ? '' : 's'} (will likely
              fail to send OSC)
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-accent2">
              ⚠ {warnCount} warning{warnCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto border border-border rounded p-2 text-[11px]">
          {issues.map((i, idx) => (
            <div
              key={idx}
              className={`flex flex-col gap-0.5 px-1 py-1 rounded ${
                i.severity === 'error' ? 'bg-danger/10' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`font-bold text-[10px] ${
                    i.severity === 'error' ? 'text-danger' : 'text-accent2'
                  }`}
                >
                  {i.severity === 'error' ? 'ERR' : 'WARN'}
                </span>
                <span className="text-muted truncate">{i.where}</span>
                <span className="text-muted">·</span>
                <span className="font-mono">{i.field}</span>
              </div>
              <div className="pl-8 text-muted">{i.problem}</div>
              <div className="pl-8 text-[10px] italic">
                Suggested fix: {i.suggested}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 mt-1">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => onLoad(session)}
            disabled={errorCount > 0}
            title={
              errorCount > 0
                ? 'Fix the errors first — loading will silently misbehave otherwise'
                : 'Load this session as-is'
            }
            style={errorCount > 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            Load anyway
          </button>
          <button
            className="btn-accent"
            onClick={() => onLoad(applyFixes(session, issues))}
          >
            Auto-fix &amp; load
          </button>
        </div>
      </div>
    </Modal>
  )
}
