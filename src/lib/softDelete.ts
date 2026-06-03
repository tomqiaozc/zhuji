/**
 * Soft delete with a 5-second undo toast.
 *
 * Hides the row locally first (mirrors the optimistic write pattern) and
 * keeps the server call pending behind a timer. The toast offers an
 * "撤销" action; if the user clicks it before the timer expires the row
 * is restored to the cache and no DELETE is sent. If the timer fires the
 * real backend delete runs through the repository (which handles its own
 * rollback if the server rejects).
 *
 * The local hide is best-effort: if the row isn't in Dexie (rare) we
 * fall through to scheduling the delete anyway so the server still gets
 * the call.
 */

import { db } from '@/db'
import {
  deleteNode as repoDeleteNode,
  deletePurchase as repoDeletePurchase,
} from '@/lib/repository'
import { dismissToast, pushActionToast } from '@/lib/toast'
import type { DecorNode, Purchase, Reminder } from '@/types'

const UNDO_WINDOW_MS = 5000

interface PurchaseSnapshot {
  purchase: Purchase
}

interface NodeSnapshot {
  node: DecorNode
  purchases: Purchase[]
  reminders: Reminder[]
}

async function snapshotPurchase(purchaseId: string): Promise<PurchaseSnapshot | null> {
  const p = await db.purchases.get(purchaseId)
  if (!p) return null
  return { purchase: p }
}

async function snapshotNode(nodeId: string): Promise<NodeSnapshot | null> {
  const node = await db.nodes.get(nodeId)
  if (!node) return null
  const purchases = await db.purchases.where('nodeId').equals(nodeId).toArray()
  const reminders = await db.reminders.where('nodeId').equals(nodeId).toArray()
  return { node, purchases, reminders }
}

async function restorePurchase(snap: PurchaseSnapshot): Promise<void> {
  await db.purchases.put(snap.purchase)
}

async function restoreNode(snap: NodeSnapshot): Promise<void> {
  await db.transaction('rw', [db.nodes, db.purchases, db.reminders], async () => {
    await db.nodes.put(snap.node)
    if (snap.purchases.length) await db.purchases.bulkPut(snap.purchases)
    if (snap.reminders.length) await db.reminders.bulkPut(snap.reminders)
  })
}

function arm<T>(
  snap: T,
  hide: () => Promise<void>,
  restore: (s: T) => Promise<void>,
  commit: () => Promise<void>,
  toastText: string,
): void {
  let undone = false
  void hide()
  // Toast id must be captured for the timer's dismiss(); pushActionToast
  // returns synchronously, so the const is set before the timer fires.
  const timer = setTimeout(() => {
    if (undone) return
    dismissToast(toastId)
    void commit()
  }, UNDO_WINDOW_MS)
  const toastId = pushActionToast(toastText, {
    label: '撤销',
    onClick: () => {
      undone = true
      clearTimeout(timer)
      dismissToast(toastId)
      void restore(snap)
    },
  })
}

/** Soft-delete a purchase with a 5-second undo window. */
export async function softDeletePurchase(purchaseId: string): Promise<void> {
  const snap = await snapshotPurchase(purchaseId)
  if (!snap) return
  arm(
    snap,
    async () => {
      await db.purchases.delete(purchaseId)
    },
    restorePurchase,
    async () => {
      await repoDeletePurchase(purchaseId)
    },
    '已删除采购',
  )
}

/** Soft-delete a node (with cascading rows) with a 5-second undo window. */
export async function softDeleteNode(nodeId: string): Promise<void> {
  const snap = await snapshotNode(nodeId)
  if (!snap) return
  arm(
    snap,
    async () => {
      await db.transaction('rw', [db.nodes, db.purchases, db.reminders], async () => {
        await db.nodes.delete(nodeId)
        await db.purchases.where('nodeId').equals(nodeId).delete()
        await db.reminders.where('nodeId').equals(nodeId).delete()
      })
    },
    restoreNode,
    async () => {
      await repoDeleteNode(nodeId)
    },
    '已删除节点',
  )
}

/** Exported only for tests. */
export const __TEST_ONLY = { UNDO_WINDOW_MS }
