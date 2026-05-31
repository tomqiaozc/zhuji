import { db } from '@/db'
import type { Asset } from '@/types'

interface MirrorState {
  enabled: boolean
  lastSyncAt?: string
  lastError?: string
}

const HANDLE_DB = 'zhuji-fs-handles'
const STORE = 'handles'
const KEY = 'mirror-dir'
const ROOT_DIR = '筑迹'
const LS_LAST_DAILY = 'zhuji-last-daily-zip'
const SNAPSHOT_RETENTION_DAYS = 30
const DEBOUNCE_MS = 2_000

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
  scheduleMirrorWrite()
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

async function ensureDir(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle> {
  let cur = root
  for (const seg of segments) {
    cur = await cur.getDirectoryHandle(seg, { create: true })
  }
  return cur
}

async function writeJsonFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  obj: unknown,
): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(JSON.stringify(obj, null, 2))
  await w.close()
}

async function writeBlobFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  blob: Blob,
): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  await w.write(blob)
  await w.close()
}

async function listFiles(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const out: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, entry] of (dir as any).entries()) {
    if (entry.kind === 'file') out.push(name)
  }
  return out
}

interface ProjectSnapshot {
  project: unknown
  nodes: unknown[]
  purchases: unknown[]
  reminders: unknown[]
  assets: {
    id: string
    refType: string
    refId: string
    fileName: string
    mimeType: string
    size: number
    createdAt: string
  }[]
  exportedAt: string
}

async function buildProjectSnapshot(
  projectId: string,
): Promise<{ snap: ProjectSnapshot; assets: Asset[] }> {
  const [project, nodes, purchases, reminders, assets] = await Promise.all([
    db.projects.get(projectId),
    db.nodes.where('projectId').equals(projectId).toArray(),
    db.purchases.where('projectId').equals(projectId).toArray(),
    db.reminders.where('projectId').equals(projectId).toArray(),
    db.assets.where('projectId').equals(projectId).toArray(),
  ])
  return {
    snap: {
      project: project ?? null,
      nodes,
      purchases,
      reminders,
      assets: assets.map((a) => ({
        id: a.id,
        refType: a.refType,
        refId: a.refId,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        createdAt: a.createdAt,
      })),
      exportedAt: new Date().toISOString(),
    },
    assets,
  }
}

function fallbackDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

async function buildFullZipBlob(): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const projects = await db.projects.toArray()
  for (const p of projects) {
    const { snap, assets } = await buildProjectSnapshot(p.id)
    const base = `${ROOT_DIR}/projects/${p.id}`
    zip.file(`${base}/data.json`, JSON.stringify(snap, null, 2))
    const imgFolder = zip.folder(`${base}/images`)
    if (imgFolder) {
      for (const a of assets) {
        imgFolder.file(a.id, a.blob, { binary: true })
      }
    }
  }
  const meta = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
  }
  zip.file(`${ROOT_DIR}/meta.json`, JSON.stringify(meta, null, 2))
  return await zip.generateAsync({ type: 'blob' })
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
    const root = await ensureDir(handle, [ROOT_DIR])
    const projectsRoot = await ensureDir(root, ['projects'])
    const projects = await db.projects.toArray()

    for (const p of projects) {
      const { snap, assets } = await buildProjectSnapshot(p.id)
      const projDir = await ensureDir(projectsRoot, [p.id])
      await writeJsonFile(projDir, 'data.json', snap)
      const imagesDir = await ensureDir(projDir, ['images'])
      const existing = new Set(await listFiles(imagesDir))
      const wanted = new Set<string>()
      for (const a of assets) {
        wanted.add(a.id)
        if (!existing.has(a.id)) {
          await writeBlobFile(imagesDir, a.id, a.blob)
        }
      }
      for (const fname of existing) {
        if (!wanted.has(fname)) {
          try {
            await imagesDir.removeEntry(fname)
          } catch {
            // ignore
          }
        }
      }
    }

    const meta = {
      version: 1,
      lastSyncAt: new Date().toISOString(),
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
    }
    await writeJsonFile(root, 'meta.json', meta)

    lastSyncAt = new Date().toISOString()
    lastError = null
  } catch (e) {
    lastError = (e as Error)?.message ?? '写入失败'
  } finally {
    writing = false
  }
}

let debounceTimer: number | null = null
let started = false

export function scheduleMirrorWrite() {
  if (debounceTimer != null) {
    window.clearTimeout(debounceTimer)
  }
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null
    void writeMirrorOnce()
  }, DEBOUNCE_MS)
}

function hookDexieAutoMirror() {
  const tables = [db.projects, db.nodes, db.purchases, db.reminders, db.assets]
  for (const t of tables) {
    t.hook('creating', () => {
      scheduleMirrorWrite()
    })
    t.hook('updating', () => {
      scheduleMirrorWrite()
    })
    t.hook('deleting', () => {
      scheduleMirrorWrite()
    })
  }
}

export function startMirrorLoop() {
  if (started) return
  started = true
  hookDexieAutoMirror()
  scheduleMirrorWrite()
  setInterval(() => {
    void writeMirrorOnce()
  }, 5 * 60_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void writeMirrorOnce()
  })
}

async function pruneOldSnapshots(snapsDir: FileSystemDirectoryHandle) {
  const cutoff = Date.now() - SNAPSHOT_RETENTION_DAYS * 86_400_000
  const names = await listFiles(snapsDir)
  for (const name of names) {
    const m = name.match(/^zhuji-(\d{4}-\d{2}-\d{2})\.zip$/)
    if (!m) continue
    const t = Date.parse(m[1])
    if (Number.isFinite(t) && t < cutoff) {
      try {
        await snapsDir.removeEntry(name)
      } catch {
        // ignore
      }
    }
  }
}

export async function maybeWriteDailyZip(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem(LS_LAST_DAILY) === today) return
  const handle = await getStoredHandle()
  if (!handle) return
  if (!(await ensurePermission(handle))) return
  try {
    const blob = await buildFullZipBlob()
    const root = await ensureDir(handle, [ROOT_DIR])
    const snapsDir = await ensureDir(root, ['snapshots'])
    const fileHandle = await snapsDir.getFileHandle(`zhuji-${today}.zip`, { create: true })
    const w = await fileHandle.createWritable()
    await w.write(blob)
    await w.close()
    await pruneOldSnapshots(snapsDir)
    localStorage.setItem(LS_LAST_DAILY, today)
  } catch (e) {
    lastError = (e as Error)?.message ?? '快照失败'
  }
}

export async function downloadSnapshotZip(): Promise<void> {
  const blob = await buildFullZipBlob()
  const today = new Date().toISOString().slice(0, 10)
  fallbackDownload(blob, `zhuji-${today}.zip`)
}
