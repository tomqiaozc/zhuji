/**
 * Repository — single source of truth for Project / Node / Checklist /
 * Purchase / Reminder mutations.
 *
 * Pattern: writes are **optimistic** — the local Dexie cache is patched
 * first so the UI (via `useLiveQuery`) reacts instantly, the HTTP call
 * runs in the background, and on failure the cache is rolled back to its
 * pre-mutation state and a toast is shown. The backend is still the
 * source of truth; its authoritative response overwrites the optimistic
 * row on success. On 401 the API client clears the auth store, which
 * sends the user to the login page; nothing in this module needs to know.
 *
 * `hydrateProjectList()` and `hydrateProject(projectId)` pull fresh
 * snapshots from the backend and replace the local cache for the
 * targeted slice. Call them after login, and on app boot when a session
 * already exists.
 */

import { db } from '@/db'
import { api, authedUrl, ensureAssetViewerToken } from '@/lib/api'
import { pushToast } from '@/lib/toast'
import { uid } from '@/lib/uid'
import {
  type ChecklistItemOut,
  type LoadDemoResponse,
  type NodeOut,
  type ProjectOut,
  type PurchaseOut,
  type ReminderOut,
  checklistFromWire,
  nodeFromWire,
  nodePatchToWire,
  nodeToWire,
  projectFromWire,
  projectToWire,
  purchaseFromWire,
  purchasePatchToWire,
  purchaseToWire,
  reminderFromWire,
  reminderPatchToWire,
  reminderToWire,
} from '@/lib/wire'
import type { ChecklistItem, DecorNode, Project, Purchase, Reminder } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────

async function cacheNode(node: DecorNode): Promise<void> {
  await db.nodes.put(node)
}

/**
 * Run an optimistic write: patch the cache first so the UI flips
 * instantly, then call the backend. If the backend rejects, roll the
 * cache back to its prior state and surface a toast — the caller can
 * still `try/catch` to do extra UI work, but the toast guarantees the
 * user always sees that their change didn't stick.
 *
 *   apply():    mutate the local cache to its optimistic state
 *   server():   make the authoritative HTTP call and return its result
 *   rollback(): restore the cache to its pre-`apply()` state on failure
 */
async function withOptimistic<T>(
  apply: () => Promise<void>,
  server: () => Promise<T>,
  rollback: () => Promise<void>,
): Promise<T> {
  await apply()
  try {
    return await server()
  } catch (err) {
    try {
      await rollback()
    } catch {
      // best-effort: a failing rollback shouldn't mask the original error
    }
    const msg = (err as Error)?.message ?? '操作失败'
    pushToast(`${msg}（已撤回本地更改）`, 'error', 5000)
    throw err
  }
}

// ─── Hydration ───────────────────────────────────────────────────

/** Wipe the local cache. Use on logout to prevent cross-account leaks. */
export async function clearLocalCache(): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.nodes, db.purchases, db.reminders],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.nodes.clear(),
        db.purchases.clear(),
        db.reminders.clear(),
      ])
    },
  )
}

/** Fetch the current user's project list and replace the cached projects. */
export async function hydrateProjectList(): Promise<Project[]> {
  const list = await api.get<ProjectOut[]>('/api/projects')
  const mapped = list.map(projectFromWire)
  await db.transaction('rw', db.projects, async () => {
    await db.projects.clear()
    await db.projects.bulkPut(mapped)
  })
  return mapped
}

/**
 * Pull a single project's nodes / checklists / purchases / reminders
 * via the bulk snapshot endpoint and replace the matching local rows.
 *
 * Before M6 perf fix this fired 3 list calls + 1 GET per node for the
 * checklist — 65 round-trips for the 62-node template project. Now: 1.
 */
export async function hydrateProject(projectId: string): Promise<void> {
  interface SnapshotOut {
    project: ProjectOut
    nodes: Array<NodeOut & { checklist: ChecklistItemOut[] }>
    purchases: PurchaseOut[]
    reminders: ReminderOut[]
  }

  const snap = await api.get<SnapshotOut>(`/api/projects/${projectId}/snapshot`)
  const project = projectFromWire(snap.project)
  const nodes: DecorNode[] = snap.nodes.map((n) =>
    nodeFromWire(n, n.checklist.map(checklistFromWire)),
  )
  const purchases = snap.purchases.map(purchaseFromWire)
  const reminders = snap.reminders.map(reminderFromWire)

  await db.transaction(
    'rw',
    [db.projects, db.nodes, db.purchases, db.reminders],
    async () => {
      // Keep `projects` in sync too — the snapshot includes the latest
      // project row, which may have drifted vs. what `hydrateProjectList`
      // last cached (e.g. another device renamed it).
      await db.projects.put(project)
      await db.nodes.where('projectId').equals(projectId).delete()
      await db.purchases.where('projectId').equals(projectId).delete()
      await db.reminders.where('projectId').equals(projectId).delete()
      if (nodes.length) await db.nodes.bulkPut(nodes)
      if (purchases.length) await db.purchases.bulkPut(purchases)
      if (reminders.length) await db.reminders.bulkPut(reminders)
    },
  )
}

/** Pull the project list AND all per-project data. Used after login. */
export async function hydrateEverything(): Promise<void> {
  const projects = await hydrateProjectList()
  await Promise.all(projects.map((p) => hydrateProject(p.id)))
  // Defensive: if the persisted UI store still points at a project that
  // doesn't belong to this account (e.g. a previous logout missed the
  // reset), repair the state now so the UI doesn't get stuck on a
  // permanent "loading…" screen waiting for an inaccessible row.
  const { useApp } = await import('@/store/app')
  const cur = useApp.getState().currentProjectId
  if (cur && !projects.some((p) => p.id === cur)) {
    useApp.getState().setProject(projects[0]?.id ?? null)
  }
}

// ─── Projects ────────────────────────────────────────────────────

export async function createProject(
  input: Omit<Project, 'id' | 'createdAt'>,
): Promise<Project> {
  // Optimistic insert with a temp id so the project list updates
  // instantly. The temp row is swapped for the authoritative server row
  // (which carries the real UUID + createdAt) once the POST returns.
  const tempId = uid('tmp-proj')
  const placeholder: Project = {
    ...input,
    id: tempId,
    createdAt: new Date().toISOString(),
  }
  return withOptimistic(
    async () => {
      await db.projects.put(placeholder)
    },
    async () => {
      const out = await api.post<ProjectOut>('/api/projects', projectToWire(input))
      const project = projectFromWire(out)
      await db.transaction('rw', db.projects, async () => {
        await db.projects.delete(tempId)
        await db.projects.put(project)
      })
      return project
    },
    async () => {
      await db.projects.delete(tempId)
    },
  )
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
): Promise<Project> {
  const prev = await db.projects.get(id)
  const optimistic: Project | null = prev ? { ...prev, ...patch } : null
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.address !== undefined) body.address = patch.address ?? null
  if (patch.area !== undefined) body.area = patch.area ?? null
  if (patch.type !== undefined) body.type = patch.type ?? null
  if (patch.startDate !== undefined) body.start_date = patch.startDate ?? null
  if (patch.expectedEndDate !== undefined) body.expected_end_date = patch.expectedEndDate ?? null
  return withOptimistic(
    async () => {
      if (optimistic) await db.projects.put(optimistic)
    },
    async () => {
      const out = await api.patch<ProjectOut>(`/api/projects/${id}`, body)
      const project = projectFromWire(out)
      await db.projects.put(project)
      return project
    },
    async () => {
      if (prev) await db.projects.put(prev)
    },
  )
}

export async function deleteProject(projectId: string): Promise<void> {
  // Snapshot every row we're about to evict so the rollback can put
  // them back if the backend rejects the delete.
  const prevProject = await db.projects.get(projectId)
  const prevNodes = await db.nodes.where('projectId').equals(projectId).toArray()
  const prevPurchases = await db.purchases.where('projectId').equals(projectId).toArray()
  const prevReminders = await db.reminders.where('projectId').equals(projectId).toArray()
  await withOptimistic(
    async () => {
      await db.transaction(
        'rw',
        [db.projects, db.nodes, db.purchases, db.reminders],
        async () => {
          await db.projects.delete(projectId)
          await db.nodes.where('projectId').equals(projectId).delete()
          await db.purchases.where('projectId').equals(projectId).delete()
          await db.reminders.where('projectId').equals(projectId).delete()
        },
      )
    },
    async () => {
      await api.delete<void>(`/api/projects/${projectId}`)
    },
    async () => {
      await db.transaction(
        'rw',
        [db.projects, db.nodes, db.purchases, db.reminders],
        async () => {
          if (prevProject) await db.projects.put(prevProject)
          if (prevNodes.length) await db.nodes.bulkPut(prevNodes)
          if (prevPurchases.length) await db.purchases.bulkPut(prevPurchases)
          if (prevReminders.length) await db.reminders.bulkPut(prevReminders)
        },
      )
    },
  )
}

// ─── Nodes ───────────────────────────────────────────────────────

export async function createNode(
  projectId: string,
  input: Omit<DecorNode, 'id' | 'projectId' | 'checklist'>,
  checklist: Array<{ text: string; done?: boolean; note?: string }> = [],
): Promise<DecorNode> {
  // Inline checklist in the create-node payload — one round-trip instead
  // of the M5-era N+1 (POST node + POST per item). Server returns the
  // node with its checklist already populated.
  const tempId = uid('tmp-node')
  const placeholder: DecorNode = {
    ...input,
    id: tempId,
    projectId,
    checklist: checklist.map((c, i) => ({
      id: `${tempId}-c${i}`,
      text: c.text,
      done: !!c.done,
      note: c.note ?? undefined,
    })),
  }
  return withOptimistic(
    async () => {
      await cacheNode(placeholder)
    },
    async () => {
      const body = {
        ...nodeToWire({ ...input, stage: input.stage, name: input.name }),
        checklist: checklist.map((c, i) => ({
          text: c.text,
          done: !!c.done,
          note: c.note ?? null,
          order: i,
        })),
      }
      const out = await api.post<NodeOut & { checklist: ChecklistItemOut[] }>(
        `/api/projects/${projectId}/nodes`,
        body,
      )
      const created: DecorNode = nodeFromWire(out, out.checklist.map(checklistFromWire))
      await db.transaction('rw', db.nodes, async () => {
        await db.nodes.delete(tempId)
        await db.nodes.put(created)
      })
      return created
    },
    async () => {
      await db.nodes.delete(tempId)
    },
  )
}

export async function updateNode(
  nodeId: string,
  patch: Partial<DecorNode>,
): Promise<DecorNode> {
  // Checklist is updated via dedicated helpers below.
  const fieldPatch = nodePatchToWire(patch)
  const existing = await db.nodes.get(nodeId)
  const hasFieldPatch = Object.keys(fieldPatch).length > 0

  return withOptimistic(
    async () => {
      // Optimistic patch: merge fields and/or checklist into the cached
      // row immediately so toggles, status changes, and checklist edits
      // all render without waiting for HTTP.
      if (existing && (hasFieldPatch || patch.checklist !== undefined)) {
        const optimistic: DecorNode = {
          ...existing,
          ...patch,
          checklist: patch.checklist ?? existing.checklist,
        }
        await cacheNode(optimistic)
      }
    },
    async () => {
      let updated: DecorNode
      if (hasFieldPatch) {
        const out = await api.patch<NodeOut>(`/api/nodes/${nodeId}`, fieldPatch)
        updated = nodeFromWire(out, existing?.checklist ?? [])
      } else if (existing) {
        updated = existing
      } else {
        // Cold start with no field patch — pull the node + its checklist.
        // Only hit in the corner case where another tab evicted the cache
        // mid-mutation; ordinary use never reaches here.
        const nodeOut = await api.get<NodeOut>(`/api/nodes/${nodeId}`)
        const items = await api.get<ChecklistItemOut[]>(`/api/nodes/${nodeId}/checklist`)
        updated = nodeFromWire(nodeOut, items.map(checklistFromWire))
      }
      if (patch.checklist !== undefined) {
        updated.checklist = await replaceChecklist(nodeId, patch.checklist)
      }
      await cacheNode(updated)
      return updated
    },
    async () => {
      if (existing) await cacheNode(existing)
    },
  )
}

export async function deleteNode(nodeId: string): Promise<void> {
  const prevNode = await db.nodes.get(nodeId)
  const prevPurchases = await db.purchases.where('nodeId').equals(nodeId).toArray()
  const prevReminders = await db.reminders.where('nodeId').equals(nodeId).toArray()
  await withOptimistic(
    async () => {
      await db.transaction('rw', [db.nodes, db.purchases, db.reminders], async () => {
        await db.nodes.delete(nodeId)
        await db.purchases.where('nodeId').equals(nodeId).delete()
        await db.reminders.where('nodeId').equals(nodeId).delete()
      })
    },
    async () => {
      await api.delete<void>(`/api/nodes/${nodeId}`)
    },
    async () => {
      await db.transaction('rw', [db.nodes, db.purchases, db.reminders], async () => {
        if (prevNode) await db.nodes.put(prevNode)
        if (prevPurchases.length) await db.purchases.bulkPut(prevPurchases)
        if (prevReminders.length) await db.reminders.bulkPut(prevReminders)
      })
    },
  )
}

// ─── Checklist ───────────────────────────────────────────────────

/**
 * Single-item helpers — used by the UI for toggle / add / remove so a
 * checkbox click is one PATCH instead of a full-list diff.
 *
 * They all keep the cached node in sync by reading the existing node,
 * applying the change locally, and writing the result back to Dexie so
 * `useLiveQuery` consumers update in place.
 */

async function patchCachedNodeChecklist(
  nodeId: string,
  mutate: (items: ChecklistItem[]) => ChecklistItem[],
): Promise<ChecklistItem[]> {
  const node = await db.nodes.get(nodeId)
  if (!node) return []
  const next = mutate(node.checklist)
  await db.nodes.put({ ...node, checklist: next })
  return next
}

/** Toggle done (or update any subset of fields) on a single checklist item. */
export async function patchChecklistItem(
  nodeId: string,
  itemId: string,
  patch: Partial<Pick<ChecklistItem, 'text' | 'done' | 'note'>>,
): Promise<ChecklistItem> {
  const body: Record<string, unknown> = {}
  if (patch.text !== undefined) body.text = patch.text
  if (patch.done !== undefined) body.done = patch.done
  if (patch.note !== undefined) body.note = patch.note ?? null
  const out = await api.patch<ChecklistItemOut>(`/api/checklist/${itemId}`, body)
  const updated = checklistFromWire(out)
  await patchCachedNodeChecklist(nodeId, (items) =>
    items.map((c) => (c.id === itemId ? updated : c)),
  )
  return updated
}

/** Append a checklist item to a node and mirror it into the cache. */
export async function addChecklistItem(
  nodeId: string,
  input: { text: string; done?: boolean; note?: string | null },
): Promise<ChecklistItem> {
  const node = await db.nodes.get(nodeId)
  const order = node ? node.checklist.length : 0
  const out = await api.post<ChecklistItemOut>(`/api/nodes/${nodeId}/checklist`, {
    text: input.text,
    done: !!input.done,
    note: input.note ?? null,
    order,
  })
  const created = checklistFromWire(out)
  await patchCachedNodeChecklist(nodeId, (items) => [...items, created])
  return created
}

/** Delete a single checklist item and drop it from the cache. */
export async function removeChecklistItem(nodeId: string, itemId: string): Promise<void> {
  await api.delete<void>(`/api/checklist/${itemId}`)
  await patchCachedNodeChecklist(nodeId, (items) => items.filter((c) => c.id !== itemId))
}

/**
 * Replace a node's checklist entirely. Diffs item-by-item so we keep
 * existing item IDs stable (UI uses them as React keys) and don't blow
 * the network bill on every keystroke. Returns the post-write list.
 *
 * Kept for bulk paths (template seeding, backup restore) — the UI's
 * toggle/add/remove use the single-item helpers above instead.
 *
 * Intentionally NOT wrapped in `withOptimistic`: the optimistic story
 * for checklists is handled one level up — `updateNode` patches the
 * cached node's `checklist` array eagerly for the common case (toggle
 * done, edit text). This helper only runs after the user commits the
 * full list and the call already follows the cached state.
 */
export async function replaceChecklist(
  nodeId: string,
  desired: ChecklistItem[],
): Promise<ChecklistItem[]> {
  const existingRows = await api.get<ChecklistItemOut[]>(`/api/nodes/${nodeId}/checklist`)
  const existing = new Map(existingRows.map((r) => [r.id, r]))
  const seen = new Set<string>()
  const out: ChecklistItem[] = []

  for (let i = 0; i < desired.length; i++) {
    const item = desired[i]
    const prev = existing.get(item.id)
    if (prev) {
      seen.add(item.id)
      // Patch only changed fields.
      const patch: Record<string, unknown> = {}
      if (prev.text !== item.text) patch.text = item.text
      if (prev.done !== item.done) patch.done = item.done
      if ((prev.note ?? undefined) !== item.note) patch.note = item.note ?? null
      if (prev.order !== i) patch.order = i
      if (Object.keys(patch).length > 0) {
        const updated = await api.patch<ChecklistItemOut>(`/api/checklist/${item.id}`, patch)
        out.push(checklistFromWire(updated))
      } else {
        out.push(checklistFromWire(prev))
      }
    } else {
      const created = await api.post<ChecklistItemOut>(`/api/nodes/${nodeId}/checklist`, {
        text: item.text,
        done: item.done,
        note: item.note ?? null,
        order: i,
      })
      out.push(checklistFromWire(created))
    }
  }

  for (const id of existing.keys()) {
    if (!seen.has(id)) {
      await api.delete<void>(`/api/checklist/${id}`)
    }
  }

  return out
}

// ─── Purchases ───────────────────────────────────────────────────

export async function createPurchase(
  projectId: string,
  input: Omit<Purchase, 'id' | 'createdAt' | 'projectId'>,
): Promise<Purchase> {
  const tempId = uid('tmp-purchase')
  const placeholder: Purchase = {
    ...input,
    id: tempId,
    projectId,
    createdAt: new Date().toISOString(),
  }
  return withOptimistic(
    async () => {
      await db.purchases.put(placeholder)
    },
    async () => {
      const out = await api.post<PurchaseOut>(
        `/api/projects/${projectId}/purchases`,
        purchaseToWire(input),
      )
      const p = purchaseFromWire(out)
      await db.transaction('rw', db.purchases, async () => {
        await db.purchases.delete(tempId)
        await db.purchases.put(p)
      })
      return p
    },
    async () => {
      await db.purchases.delete(tempId)
    },
  )
}

export async function updatePurchase(
  purchaseId: string,
  patch: Partial<Purchase>,
): Promise<Purchase> {
  const prev = await db.purchases.get(purchaseId)
  const optimistic: Purchase | null = prev ? { ...prev, ...patch } : null
  return withOptimistic(
    async () => {
      if (optimistic) await db.purchases.put(optimistic)
    },
    async () => {
      const out = await api.patch<PurchaseOut>(
        `/api/purchases/${purchaseId}`,
        purchasePatchToWire(patch),
      )
      const p = purchaseFromWire(out)
      await db.purchases.put(p)
      return p
    },
    async () => {
      if (prev) await db.purchases.put(prev)
    },
  )
}

export async function deletePurchase(purchaseId: string): Promise<void> {
  const prev = await db.purchases.get(purchaseId)
  await withOptimistic(
    async () => {
      await db.purchases.delete(purchaseId)
    },
    async () => {
      await api.delete<void>(`/api/purchases/${purchaseId}`)
    },
    async () => {
      if (prev) await db.purchases.put(prev)
    },
  )
}

// ─── Reminders ───────────────────────────────────────────────────

export async function createReminder(
  projectId: string,
  input: Omit<Reminder, 'id' | 'projectId'>,
): Promise<Reminder> {
  const tempId = uid('tmp-rem')
  const placeholder: Reminder = {
    ...input,
    id: tempId,
    projectId,
  }
  return withOptimistic(
    async () => {
      await db.reminders.put(placeholder)
    },
    async () => {
      const out = await api.post<ReminderOut>(
        `/api/projects/${projectId}/reminders`,
        reminderToWire(input),
      )
      const r = reminderFromWire(out)
      await db.transaction('rw', db.reminders, async () => {
        await db.reminders.delete(tempId)
        await db.reminders.put(r)
      })
      return r
    },
    async () => {
      await db.reminders.delete(tempId)
    },
  )
}

export async function updateReminder(
  reminderId: string,
  patch: Partial<Reminder>,
): Promise<Reminder> {
  const prev = await db.reminders.get(reminderId)
  const optimistic: Reminder | null = prev ? { ...prev, ...patch } : null
  return withOptimistic(
    async () => {
      if (optimistic) await db.reminders.put(optimistic)
    },
    async () => {
      const out = await api.patch<ReminderOut>(
        `/api/reminders/${reminderId}`,
        reminderPatchToWire(patch),
      )
      const r = reminderFromWire(out)
      await db.reminders.put(r)
      return r
    },
    async () => {
      if (prev) await db.reminders.put(prev)
    },
  )
}

export async function deleteReminder(reminderId: string): Promise<void> {
  const prev = await db.reminders.get(reminderId)
  await withOptimistic(
    async () => {
      await db.reminders.delete(reminderId)
    },
    async () => {
      await api.delete<void>(`/api/reminders/${reminderId}`)
    },
    async () => {
      if (prev) await db.reminders.put(prev)
    },
  )
}

// ─── Demo ────────────────────────────────────────────────────────

export interface LoadDemoResult {
  project: Project
  nodeCount: number
  purchaseCount: number
  totalSpent: number
}

export async function loadDemoProject(): Promise<LoadDemoResult> {
  const out = await api.post<LoadDemoResponse>('/api/projects/load-demo')
  const project = projectFromWire(out.project)
  await db.projects.put(project)
  // The new project's nodes / purchases / etc. weren't in the response —
  // pull them into the local cache.
  await hydrateProject(project.id)
  return {
    project,
    nodeCount: out.stats.node_count,
    purchaseCount: out.stats.purchase_count,
    totalSpent: out.stats.total_spent,
  }
}

// ─── Assets (M6: Azure Blob Storage) ─────────────────────────────

export interface AssetSummary {
  id: string
  projectId: string
  refType: 'node' | 'purchase'
  refId: string
  /** Auth-protected proxy URL — works in `<img src>` because it embeds
   *  the JWT as a query parameter. Built from the asset id, NOT the raw
   *  blob URL (the container is private). */
  contentUrl: string
  fileName: string
  mimeType: string
  size: number
  createdAt: string
}

interface AssetOut {
  id: string
  project_id: string
  ref_type: string
  ref_id: string
  // NB: no `blob_url` — the raw Azure URL is private and never leaves
  // the backend. We build the auth-protected proxy URL from `id`.
  file_name: string
  mime_type: string
  size: number
  created_at: string
}

function assetFromWire(a: AssetOut): AssetSummary {
  // Backend currently only emits 'node' | 'purchase', but the wire field
  // is `str` server-side — guard so an unexpected value doesn't silently
  // wrong-type downstream filters.
  const refType: 'node' | 'purchase' = a.ref_type === 'purchase' ? 'purchase' : 'node'
  return {
    id: a.id,
    projectId: a.project_id,
    refType,
    refId: a.ref_id,
    contentUrl: authedUrl(`/api/assets/${a.id}/content`),
    fileName: a.file_name,
    mimeType: a.mime_type,
    size: a.size,
    createdAt: a.created_at,
  }
}

export async function listAssets(projectId: string): Promise<AssetSummary[]> {
  // Mint / refresh the short-TTL viewer token BEFORE wiring URLs so
  // `<img src>` has a working `?token=` from the first render.
  await ensureAssetViewerToken()
  const rows = await api.get<AssetOut[]>(`/api/projects/${projectId}/assets`)
  return rows.map(assetFromWire)
}

export async function uploadAsset(
  projectId: string,
  refType: 'node' | 'purchase',
  refId: string,
  file: File,
): Promise<AssetSummary> {
  const form = new FormData()
  form.set('ref_type', refType)
  form.set('ref_id', refId)
  form.set('file', file)
  const out = await api.upload<AssetOut>(`/api/projects/${projectId}/assets`, form)
  // The upload response feeds straight into the gallery state; make
  // sure the viewer token is in cache so its `<img src>` works.
  await ensureAssetViewerToken()
  return assetFromWire(out)
}

export async function deleteAsset(assetId: string): Promise<void> {
  await api.delete<void>(`/api/assets/${assetId}`)
}

// ─── Bulk project init from template ─────────────────────────────

export interface InitTemplateNode {
  stage: string
  name: string
  status?: string
  tips?: string
  tipsModified?: boolean
  notes?: string
  checklist: Array<{ text: string; done?: boolean; note?: string | null }>
}

interface InitTemplateNodeWire {
  stage: string
  name: string
  status?: string
  tips?: string
  tips_modified?: boolean
  notes?: string
  checklist: Array<{ text: string; done?: boolean; note?: string | null }>
}

interface InitResponseOut {
  project_id: string
  node_count: number
  checklist_count: number
}

/**
 * Replaces the M5-era ~600-request loop in `src/lib/projects.ts`. One
 * round-trip seeds every node + checklist item in a single backend
 * transaction; the cache is then re-hydrated by the caller.
 */
export async function initProjectFromTemplate(
  projectId: string,
  nodes: InitTemplateNode[],
): Promise<{ nodeCount: number; checklistCount: number }> {
  const wire: InitTemplateNodeWire[] = nodes.map((n) => ({
    stage: n.stage,
    name: n.name,
    status: n.status,
    tips: n.tips,
    tips_modified: n.tipsModified,
    notes: n.notes,
    checklist: n.checklist,
  }))
  const out = await api.post<InitResponseOut>(
    `/api/projects/${projectId}/init-from-template`,
    { nodes: wire },
  )
  return { nodeCount: out.node_count, checklistCount: out.checklist_count }
}
