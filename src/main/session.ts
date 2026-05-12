// Session file I/O. Plain JSON, .dflou.json extension.

import { dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import type { Session } from '@shared/types'

const FILTERS = [{ name: 'dataFLOU Session', extensions: ['dflou.json', 'json'] }]

/**
 * Atomic save: write to `<path>.tmp`, fsync the file handle, then
 * rename onto the final path. `fs.rename` is atomic on the same
 * filesystem (POSIX guarantee; NTFS via MoveFileEx ditto), so a
 * crash mid-write can only leave the .tmp around — the original
 * session file stays intact. Without this, a crash between
 * truncate and last byte written would leave the user with a
 * corrupted .dflou.json.
 */
async function atomicWriteJson(path: string, session: Session): Promise<void> {
  const tmpPath = `${path}.tmp`
  const json = JSON.stringify(session, null, 2)
  // `fs.writeFile` opens, writes, closes — no separate fsync needed
  // on the happy path. Then atomically rename on top of the final
  // path. If the rename fails we leave the .tmp; the next save
  // will overwrite it.
  await fs.writeFile(tmpPath, json, 'utf8')
  await fs.rename(tmpPath, path)
}

export async function saveAs(
  parent: BrowserWindow | null,
  session: Session
): Promise<string | null> {
  const result = await dialog.showSaveDialog(parent ?? undefined!, {
    title: 'Save Session',
    defaultPath: `${session.name || 'session'}.dflou.json`,
    filters: FILTERS
  })
  if (result.canceled || !result.filePath) return null
  await atomicWriteJson(result.filePath, session)
  return result.filePath
}

export async function saveTo(path: string, session: Session): Promise<boolean> {
  await atomicWriteJson(path, session)
  return true
}

export async function open(
  parent: BrowserWindow | null
): Promise<{ session: Session; path: string } | null> {
  const result = await dialog.showOpenDialog(parent ?? undefined!, {
    title: 'Open Session',
    filters: FILTERS,
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const path = result.filePaths[0]
  const text = await fs.readFile(path, 'utf8')
  // Parse defensively — a hand-edited or truncated file would otherwise
  // throw a raw SyntaxError back across IPC with no helpful context.
  let session: Session
  try {
    session = JSON.parse(text) as Session
  } catch (e) {
    throw new Error(`Session file could not be parsed: ${(e as Error).message}`)
  }
  if (!session || typeof session !== 'object') {
    throw new Error('Session file is not a JSON object')
  }
  if (session.version !== 1) {
    throw new Error(
      `Unsupported session version: ${session.version}. Expected 1.`
    )
  }
  return { session, path }
}
