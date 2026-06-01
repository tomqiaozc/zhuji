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
    // v2:
    //   1. drop the unused `assets` store — images are stored in Azure
    //      Blob Storage server-side since M6 and nothing writes to the
    //      local Dexie table anymore. Passing `null` deletes the store.
    //   2. add [projectId+status] composite index on `nodes` so dashboard
    //      queries like "doing nodes for this project" and "done count"
    //      hit the index instead of scanning every node in the project.
    this.version(2).stores({
      assets: null,
      nodes:
        'id, projectId, stage, order, status, [projectId+order], [projectId+status]',
    })
  }
}

export const db = new ZhujiDB()
