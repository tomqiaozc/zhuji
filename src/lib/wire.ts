/**
 * Backend payload shapes (snake_case, server's `XxxOut` schemas) and
 * mappers to the frontend's existing camelCase types. Centralized so
 * the rest of the repository layer stays JSON-shape-agnostic.
 */

import type { ChecklistItem, DecorNode, NodeStatus, Project, Purchase, Reminder } from '@/types'

// ─── Wire types ──────────────────────────────────────────────────

export interface UserOut {
  id: string
  username: string
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  user: UserOut
}

export interface ProjectOut {
  id: string
  user_id: string
  name: string
  address: string | null
  area: number | string | null
  type: string | null
  start_date: string | null
  expected_end_date: string | null
  created_at: string
}

export interface ProjectIn {
  name: string
  address?: string | null
  area?: number | null
  type?: string | null
  start_date?: string | null
  expected_end_date?: string | null
}

export interface NodeOut {
  id: string
  project_id: string
  stage: string
  name: string
  order: number
  status: string
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  tips: string
  tips_modified: boolean
  notes: string
}

export interface NodeIn {
  stage: string
  name: string
  order?: number
  status?: string
  planned_start?: string | null
  planned_end?: string | null
  actual_start?: string | null
  actual_end?: string | null
  tips?: string
  tips_modified?: boolean
  notes?: string
}

export interface ChecklistItemOut {
  id: string
  node_id: string
  text: string
  done: boolean
  note: string | null
  order: number
}

export interface PurchaseOut {
  id: string
  project_id: string
  node_id: string | null
  name: string
  spec: string | null
  brand: string | null
  channel: string | null
  category: string
  unit_price: number | string
  quantity: number | string
  total_price: number | string
  purchase_date: string | null
  purchase_url: string | null
  remark: string | null
  created_at: string
}

export interface PurchaseIn {
  node_id?: string | null
  name: string
  spec?: string | null
  brand?: string | null
  channel?: string | null
  category?: string
  unit_price?: number
  quantity?: number
  total_price?: number
  purchase_date?: string | null
  purchase_url?: string | null
  remark?: string | null
}

export interface ReminderOut {
  id: string
  project_id: string
  node_id: string | null
  title: string
  trigger_at: string
  repeated: string | null
  done: boolean
}

export interface ReminderIn {
  node_id?: string | null
  title: string
  trigger_at: string
  repeated?: string | null
  done?: boolean
}

export interface LoadDemoResponse {
  project: ProjectOut
  stats: {
    stage_count: number
    node_count: number
    purchase_count: number
    total_spent: number
  }
}

// ─── Mappers ─────────────────────────────────────────────────────

const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0
  return typeof v === 'number' ? v : Number(v)
}

export function projectFromWire(p: ProjectOut): Project {
  return {
    id: p.id,
    name: p.name,
    address: p.address ?? undefined,
    area: p.area == null ? undefined : num(p.area),
    type: (p.type ?? undefined) as Project['type'],
    startDate: p.start_date ?? undefined,
    expectedEndDate: p.expected_end_date ?? undefined,
    createdAt: p.created_at,
  }
}

export function projectToWire(p: Omit<Project, 'id' | 'createdAt'>): ProjectIn {
  return {
    name: p.name,
    address: p.address ?? null,
    area: p.area ?? null,
    type: (p.type ?? null) as string | null,
    start_date: p.startDate ?? null,
    expected_end_date: p.expectedEndDate ?? null,
  }
}

export function nodeFromWire(n: NodeOut, checklist: ChecklistItem[] = []): DecorNode {
  return {
    id: n.id,
    projectId: n.project_id,
    stage: n.stage,
    name: n.name,
    order: n.order,
    status: (n.status as NodeStatus) ?? 'todo',
    plannedStart: n.planned_start ?? undefined,
    plannedEnd: n.planned_end ?? undefined,
    actualStart: n.actual_start ?? undefined,
    actualEnd: n.actual_end ?? undefined,
    tips: n.tips,
    tipsModified: n.tips_modified,
    checklist,
    notes: n.notes,
  }
}

export function nodeToWire(
  n: Partial<DecorNode> & Pick<DecorNode, 'stage' | 'name'>,
): NodeIn {
  return {
    stage: n.stage,
    name: n.name,
    order: n.order,
    status: n.status,
    planned_start: n.plannedStart ?? null,
    planned_end: n.plannedEnd ?? null,
    actual_start: n.actualStart ?? null,
    actual_end: n.actualEnd ?? null,
    tips: n.tips ?? '',
    tips_modified: n.tipsModified ?? false,
    notes: n.notes ?? '',
  }
}

export function nodePatchToWire(patch: Partial<DecorNode>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.stage !== undefined) out.stage = patch.stage
  if (patch.name !== undefined) out.name = patch.name
  if (patch.order !== undefined) out.order = patch.order
  if (patch.status !== undefined) out.status = patch.status
  if (patch.plannedStart !== undefined) out.planned_start = patch.plannedStart ?? null
  if (patch.plannedEnd !== undefined) out.planned_end = patch.plannedEnd ?? null
  if (patch.actualStart !== undefined) out.actual_start = patch.actualStart ?? null
  if (patch.actualEnd !== undefined) out.actual_end = patch.actualEnd ?? null
  if (patch.tips !== undefined) out.tips = patch.tips
  if (patch.tipsModified !== undefined) out.tips_modified = patch.tipsModified
  if (patch.notes !== undefined) out.notes = patch.notes
  return out
}

export function checklistFromWire(c: ChecklistItemOut): ChecklistItem {
  return {
    id: c.id,
    text: c.text,
    done: c.done,
    note: c.note ?? undefined,
  }
}

export function purchaseFromWire(p: PurchaseOut): Purchase {
  return {
    id: p.id,
    projectId: p.project_id,
    nodeId: p.node_id ?? '',
    name: p.name,
    spec: p.spec ?? undefined,
    brand: p.brand ?? undefined,
    channel: p.channel ?? undefined,
    category: p.category,
    unitPrice: num(p.unit_price),
    quantity: num(p.quantity),
    totalPrice: num(p.total_price),
    purchaseDate: p.purchase_date ?? '',
    purchaseUrl: p.purchase_url ?? undefined,
    imageIds: [], // images are server-side blob URLs in M5+; legacy local IDs no longer apply
    remark: p.remark ?? undefined,
    createdAt: p.created_at,
  }
}

export function purchaseToWire(p: Omit<Purchase, 'id' | 'createdAt' | 'projectId'>): PurchaseIn {
  return {
    node_id: p.nodeId || null,
    name: p.name,
    spec: p.spec ?? null,
    brand: p.brand ?? null,
    channel: p.channel ?? null,
    category: p.category,
    unit_price: p.unitPrice,
    quantity: p.quantity,
    total_price: p.totalPrice,
    purchase_date: p.purchaseDate || null,
    purchase_url: p.purchaseUrl ?? null,
    remark: p.remark ?? null,
  }
}

export function purchasePatchToWire(patch: Partial<Purchase>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.nodeId !== undefined) out.node_id = patch.nodeId || null
  if (patch.name !== undefined) out.name = patch.name
  if (patch.spec !== undefined) out.spec = patch.spec ?? null
  if (patch.brand !== undefined) out.brand = patch.brand ?? null
  if (patch.channel !== undefined) out.channel = patch.channel ?? null
  if (patch.category !== undefined) out.category = patch.category
  if (patch.unitPrice !== undefined) out.unit_price = patch.unitPrice
  if (patch.quantity !== undefined) out.quantity = patch.quantity
  if (patch.totalPrice !== undefined) out.total_price = patch.totalPrice
  if (patch.purchaseDate !== undefined) out.purchase_date = patch.purchaseDate || null
  if (patch.purchaseUrl !== undefined) out.purchase_url = patch.purchaseUrl ?? null
  if (patch.remark !== undefined) out.remark = patch.remark ?? null
  return out
}

export function reminderFromWire(r: ReminderOut): Reminder {
  return {
    id: r.id,
    projectId: r.project_id,
    nodeId: r.node_id ?? undefined,
    title: r.title,
    triggerAt: r.trigger_at,
    repeated: (r.repeated ?? 'none') as Reminder['repeated'],
    done: r.done,
  }
}

export function reminderToWire(r: Omit<Reminder, 'id' | 'projectId'>): ReminderIn {
  return {
    node_id: r.nodeId ?? null,
    title: r.title,
    trigger_at: r.triggerAt,
    repeated: r.repeated ?? null,
    done: r.done,
  }
}

export function reminderPatchToWire(patch: Partial<Reminder>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.nodeId !== undefined) out.node_id = patch.nodeId || null
  if (patch.title !== undefined) out.title = patch.title
  if (patch.triggerAt !== undefined) out.trigger_at = patch.triggerAt
  if (patch.repeated !== undefined) out.repeated = patch.repeated ?? null
  if (patch.done !== undefined) out.done = patch.done
  return out
}
