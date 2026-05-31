import { db } from '@/db'

export async function deletePurchase(purchaseId: string): Promise<void> {
  await db.transaction('rw', db.purchases, db.assets, async () => {
    await db.assets.where('[refType+refId]').equals(['purchase', purchaseId]).delete()
    await db.purchases.delete(purchaseId)
  })
}

export async function deleteNodeCascade(nodeId: string): Promise<void> {
  await db.transaction('rw', db.nodes, db.purchases, db.assets, db.reminders, async () => {
    const purchases = await db.purchases.where('nodeId').equals(nodeId).toArray()
    for (const p of purchases) {
      await db.assets.where('[refType+refId]').equals(['purchase', p.id]).delete()
    }
    await db.purchases.where('nodeId').equals(nodeId).delete()
    await db.assets.where('[refType+refId]').equals(['node', nodeId]).delete()
    await db.reminders.where('nodeId').equals(nodeId).delete()
    await db.nodes.delete(nodeId)
  })
}

export async function deleteAsset(assetId: string): Promise<void> {
  await db.transaction('rw', db.assets, db.purchases, db.nodes, async () => {
    const asset = await db.assets.get(assetId)
    if (!asset) return
    await db.assets.delete(assetId)
    if (asset.refType === 'purchase') {
      const p = await db.purchases.get(asset.refId)
      if (p) {
        const next = (p.imageIds ?? []).filter((id) => id !== assetId)
        await db.purchases.update(p.id, { imageIds: next })
      }
    }
    // For node assets we look them up by [refType+refId] index, not by an
    // explicit list on the node — nothing to patch.
  })
}
