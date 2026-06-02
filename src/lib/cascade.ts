/**
 * Cascading deletes — all routed through the backend repository so the
 * server stays authoritative. The local Dexie cache is updated as a
 * side-effect inside the repository helpers.
 */

import {
  deleteNode as repoDeleteNode,
  deletePurchase as repoDeletePurchase,
} from '@/lib/repository'

export async function deletePurchase(purchaseId: string): Promise<void> {
  await repoDeletePurchase(purchaseId)
}

export async function deleteNodeCascade(nodeId: string): Promise<void> {
  // Backend cascades by FK; the local cache is wiped inside the helper.
  await repoDeleteNode(nodeId)
}
