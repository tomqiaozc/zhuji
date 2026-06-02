import Dexie, { type Table } from 'dexie'
import type { Project, DecorNode, Purchase, Reminder } from '@/types'

export class ZhujiDB extends Dexie {
  projects!: Table<Project, string>
  nodes!: Table<DecorNode, string>
  purchases!: Table<Purchase, string>
  reminders!: Table<Reminder, string>

  constructor() {
    super('zhuji-db')
    this.version(1).stores({
      projects: 'id, createdAt, name',
      nodes: 'id, projectId, stage, order, status, [projectId+order]',
      purchases:
        'id, projectId, nodeId, purchaseDate, category, [projectId+nodeId], [projectId+purchaseDate]',
      assets: 'id, projectId, refType, refId, [refType+refId]',
      reminders: 'id, projectId, nodeId, triggerAt, done',
    })
    // v2: drop the unused `assets` store. Images are stored in Azure
    // Blob Storage server-side since M6 — nothing writes to the local
    // Dexie table anymore. Existing clients migrate cleanly: passing
    // `null` for the store name tells Dexie to delete it.
    this.version(2).stores({
      assets: null,
    })
  }
}

export const db = new ZhujiDB()
