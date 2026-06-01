/**
 * Repository — single source of truth for Project / Node / Checklist /
 * Purchase / Reminder mutations.
 *
 * Pattern: every write goes to the backend FIRST, then mirrors the
 * authoritative response into Dexie. UI code keeps reading from Dexie
 * via `useLiveQuery` and reacts immediately when the cache is patched.
 * On 401 the API client clears the auth store, which sends the user to
 * the login page; nothing in this module needs to know.
 *
 * `hydrateProjectList()` and `hydrateProject(projectId)` pull fresh
 * snapshots from the backend and replace the local cache for the
 * targeted slice. Call them after login, and on app boot when a session
 * already exists.
 */

import { db } from '@/db'
import { api } from '@/lib/api'
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

async function loadNodeWithChecklist(nodeOut: NodeOut): Promise<DecorNode> {
  const items = await api.get<ChecklistItemOut[]>(`/api/nodes/${nodeOut.id}/checklist`)
  return nodeFromWire(
    nodeOut,
    items.map(checklistFromWire),
  )
}

async function cacheNode(node: DecorNode): Promise<void> {
  await db.nodes.put(node)
}

// ─── Hydration ───────────────────────────────────────────────────

/** Wipe the local cache. Use on logout to prevent cross-account leaks. */
export async function clearLocalCache(): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.nodes, db.purchases, db.assets, db.reminders],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.nodes.clear(),
        db.purchases.clear(),
        db.assets.clear(),
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
 * and replace the matching local rows. Other projects' caches are left
 * intact.
 */
export async function hydrateProject(projectId: string): Promise<void> {
  const [nodesOut, purchasesOut, remindersOut] = await Promise.all([
    api.get<NodeOut[]>(`/api/projects/${projectId}/nodes`),
    api.get<PurchaseOut[]>(`/api/projects/${projectId}/purchases`),
    api.get<ReminderOut[]>(`/api/projects/${projectId}/reminders`),
  ])

  // Hydrate checklists in parallel batches to keep this responsive on
  // the demo project (62 nodes → 62 requests).
  const nodes: DecorNode[] = []
  const CONCURRENCY = 8
  for (let i = 0; i < nodesOut.length; i += CONCURRENCY) {
    const slice = nodesOut.slice(i, i + CONCURRENCY)
    const hydrated = await Promise.all(slice.map(loadNodeWithChecklist))
    nodes.push(...hydrated)
  }

  const purchases = purchasesOut.map(purchaseFromWire)
  const reminders = remindersOut.map(reminderFromWire)

  await db.transaction('rw', [db.nodes, db.purchases, db.reminders], async () => {
    await db.nodes.where('projectId').equals(projectId).delete()
    await db.purchases.where('projectId').equals(projectId).delete()
    await db.reminders.where('projectId').equals(projectId).delete()
    if (nodes.length) await db.nodes.bulkPut(nodes)
    if (purchases.length) await db.purchases.bulkPut(purchases)
    if (reminders.length) await db.reminders.bulkPut(reminders)
  })
}

/** Pull the project list AND all per-project data. Used after login. */
export async function hydrateEverything(): Promise<void> {
  const projects = await hydrateProjectList()
  for (const p of projects) {
    await hydrateProject(p.id)
  }
}

// ─── Projects ────────────────────────────────────────────────────

export async function createProject(
  input: Omit<Project, 'id' | 'createdAt'>,
): Promise<Project> {
  const out = await api.post<ProjectOut>('/api/projects', projectToWire(input))
  const project = projectFromWire(out)
  await db.projects.put(project)
  return project
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
): Promise<Project> {
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.address !== undefined) body.address = patch.address ?? null
  if (patch.area !== undefined) body.area = patch.area ?? null
  if (patch.type !== undefined) body.type = patch.type ?? null
  if (patch.startDate !== undefined) body.start_date = patch.startDate ?? null
  if (patch.expectedEndDate !== undefined) body.expected_end_date = patch.expectedEndDate ?? null
  const out = await api.patch<ProjectOut>(`/api/projects/${id}`, body)
  const project = projectFromWire(out)
  await db.projects.put(project)
  return project
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete<void>(`/api/projects/${projectId}`)
  await db.transaction(
    'rw',
    [db.projects, db.nodes, db.purchases, db.assets, db.reminders],
    async () => {
      await db.projects.delete(projectId)
      await db.nodes.where('projectId').equals(projectId).delete()
      await db.purchases.where('projectId').equals(projectId).delete()
      await db.assets.where('projectId').equals(projectId).delete()
      await db.reminders.where('projectId').equals(projectId).delete()
    },
  )
}

// ─── Nodes ───────────────────────────────────────────────────────

export async function createNode(
  projectId: string,
  input: Omit<DecorNode, 'id' | 'projectId' | 'checklist'>,
  checklist: Array<{ text: string; done?: boolean; note?: string }> = [],
): Promise<DecorNode> {
  const out = await api.post<NodeOut>(
    `/api/projects/${projectId}/nodes`,
    nodeToWire({ ...input, stage: input.stage, name: input.name }),
  )
  const created: DecorNode = nodeFromWire(out, [])
  // Create checklist items in order, sequentially to keep `order` correct.
  const items: ChecklistItem[] = []
  for (let i = 0; i < checklist.length; i++) {
    const c = checklist[i]
    const co = await api.post<ChecklistItemOut>(`/api/nodes/${out.id}/checklist`, {
      text: c.text,
      done: !!c.done,
      note: c.note ?? null,
      order: i,
    })
    items.push(checklistFromWire(co))
  }
  created.checklist = items
  await cacheNode(created)
  return created
}

export async function updateNode(
  nodeId: string,
  patch: Partial<DecorNode>,
): Promise<DecorNode> {
  // Checklist is updated via dedicated helpers below.
  const fieldPatch = nodePatchToWire(patch)
  const existing = await db.nodes.get(nodeId)
  let updated: DecorNode
  if (Object.keys(fieldPatch).length > 0) {
    const out = await api.patch<NodeOut>(`/api/nodes/${nodeId}`, fieldPatch)
    updated = nodeFromWire(out, existing?.checklist ?? [])
  } else {
    updated = existing ?? (await loadNodeWithChecklist(await api.get<NodeOut>(`/api/nodes/${nodeId}`)))
  }
  if (patch.checklist !== undefined) {
    updated.checklist = await replaceChecklist(nodeId, patch.checklist)
  }
  await cacheNode(updated)
  return updated
}

export async function deleteNode(nodeId: string): Promise<void> {
  await api.delete<void>(`/api/nodes/${nodeId}`)
  await db.transaction('rw', [db.nodes, db.purchases, db.assets, db.reminders], async () => {
    await db.nodes.delete(nodeId)
    await db.purchases.where('nodeId').equals(nodeId).delete()
    await db.reminders.where('nodeId').equals(nodeId).delete()
    await db.assets.where('[refType+refId]').equals(['node', nodeId]).delete()
  })
}

// ─── Checklist ───────────────────────────────────────────────────

/**
 * Replace a node's checklist entirely. Diffs item-by-item so we keep
 * existing item IDs stable (UI uses them as React keys) and don't blow
 * the network bill on every keystroke. Returns the post-write list.
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
  const out = await api.post<PurchaseOut>(
    `/api/projects/${projectId}/purchases`,
    purchaseToWire(input),
  )
  const p = purchaseFromWire(out)
  await db.purchases.put(p)
  return p
}

export async function updatePurchase(
  purchaseId: string,
  patch: Partial<Purchase>,
): Promise<Purchase> {
  const out = await api.patch<PurchaseOut>(
    `/api/purchases/${purchaseId}`,
    purchasePatchToWire(patch),
  )
  const p = purchaseFromWire(out)
  await db.purchases.put(p)
  return p
}

export async function deletePurchase(purchaseId: string): Promise<void> {
  await api.delete<void>(`/api/purchases/${purchaseId}`)
  await db.purchases.delete(purchaseId)
  await db.assets.where('[refType+refId]').equals(['purchase', purchaseId]).delete()
}

// ─── Reminders ───────────────────────────────────────────────────

export async function createReminder(
  projectId: string,
  input: Omit<Reminder, 'id' | 'projectId'>,
): Promise<Reminder> {
  const out = await api.post<ReminderOut>(
    `/api/projects/${projectId}/reminders`,
    reminderToWire(input),
  )
  const r = reminderFromWire(out)
  await db.reminders.put(r)
  return r
}

export async function updateReminder(
  reminderId: string,
  patch: Partial<Reminder>,
): Promise<Reminder> {
  const out = await api.patch<ReminderOut>(
    `/api/reminders/${reminderId}`,
    reminderPatchToWire(patch),
  )
  const r = reminderFromWire(out)
  await db.reminders.put(r)
  return r
}

export async function deleteReminder(reminderId: string): Promise<void> {
  await api.delete<void>(`/api/reminders/${reminderId}`)
  await db.reminders.delete(reminderId)
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
