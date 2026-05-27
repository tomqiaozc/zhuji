import Dexie, { type Table } from 'dexie'
import type { Project, DecorNode, Purchase, Asset, Reminder } from '@/types'

export class ZhujiDB extends Dexie {
  projects!: Table<Project, string>
  nodes!: Table<DecorNode, string>
  purchases!: Table<Purchase, string>
  assets!: Table<Asset, string>
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
  }
}

export const db = new ZhujiDB()
