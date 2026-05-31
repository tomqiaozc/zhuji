import { db } from '@/db'

interface MirrorState {
  enabled: boolean
  lastSyncAt?: string
  lastError?: string
}

const HANDLE_DB = 'zhuji-fs-handles'
const STORE = 'handles'
const KEY = 'mirror-dir'

function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const idb = await openHandleDB()
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function setStoredHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const idb = await openHandleDB()
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    if (handle) store.put(handle, KEY)
    else store.delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function isFsAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function pickMirrorDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFsAccessSupported()) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  await setStoredHandle(handle)
  return handle
}

export async function disableMirror(): Promise<void> {
  await setStoredHandle(null)
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = handle as any
  if ((await h.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true
  if ((await h.requestPermission?.({ mode: 'readwrite' })) === 'granted') return true
  return false
}

export async function exportSnapshot(): Promise<{
  projects: unknown
  nodes: unknown
  purchases: unknown
  reminders: unknown
  exportedAt: string
}> {
  const [projects, nodes, purchases, reminders] = await Promise.all([
    db.projects.toArray(),
    db.nodes.toArray(),
    db.purchases.toArray(),
    db.reminders.toArray(),
  ])
  return {
    projects,
    nodes,
    purchases,
    reminders,
    exportedAt: new Date().toISOString(),
  }
}

let lastError: string | null = null
let lastSyncAt: string | null = null
let writing = false

export function getMirrorStatus(): MirrorState {
  return {
    enabled: false,
    lastSyncAt: lastSyncAt ?? undefined,
    lastError: lastError ?? undefined,
  }
}

export async function writeMirrorOnce(): Promise<void> {
  if (writing) return
  const handle = await getStoredHandle()
  if (!handle) return
  if (!(await ensurePermission(handle))) {
    lastError = '权限被拒绝'
    return
  }
  writing = true
  try {
    const snap = await exportSnapshot()
    const file = await handle.getFileHandle('zhuji-data.json', { create: true })
    const writable = await file.createWritable()
    await writable.write(JSON.stringify(snap, null, 2))
    await writable.close()
    lastSyncAt = new Date().toISOString()
    lastError = null
  } catch (e) {
    lastError = (e as Error)?.message ?? '写入失败'
  } finally {
    writing = false
  }
}

let started = false
export function startMirrorLoop() {
  if (started) return
  started = true
  // Initial write on startup, then on a 60s heartbeat.
  void writeMirrorOnce()
  setInterval(() => {
    void writeMirrorOnce()
  }, 60_000)
  // Also flush on tab hide so users get a final write.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void writeMirrorOnce()
  })
}

// ------------------ Daily Zip snapshot ------------------

const LS_LAST_DAILY = 'zhuji-last-daily-zip'

export async function maybeWriteDailyZip(): Promise<void> {
  const handle = await getStoredHandle()
  if (!handle) return
  if (!(await ensurePermission(handle))) return
  const today = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem(LS_LAST_DAILY) === today) return
  try {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const snap = await exportSnapshot()
    zip.file('zhuji-data.json', JSON.stringify(snap, null, 2))
    const assets = await db.assets.toArray()
    const folder = zip.folder('assets')
    if (folder) {
      for (const a of assets) {
        folder.file(`${a.id}-${a.fileName}`, a.blob)
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const snapsDir = await handle.getDirectoryHandle('snapshots', { create: true })
    const fileHandle = await snapsDir.getFileHandle(`zhuji-${today}.zip`, { create: true })
    const w = await fileHandle.createWritable()
    await w.write(blob)
    await w.close()
    localStorage.setItem(LS_LAST_DAILY, today)
  } catch (e) {
    lastError = (e as Error)?.message ?? '快照失败'
  }
}
