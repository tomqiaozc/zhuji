import { db } from '@/db'
import { getActiveTemplates } from '@/data/userTemplates'
import type { DecorNode, Project } from '@/types'
import { uid } from './uid'

export async function instantiateNodes(projectId: string): Promise<DecorNode[]> {
  const now = new Date().toISOString()
  const nodes: DecorNode[] = []
  let order = 0
  for (const stage of getActiveTemplates()) {
    for (const n of stage.nodes) {
      nodes.push({
        id: uid('node'),
        projectId,
        stage: stage.stage,
        name: n.name,
        order: order++,
        status: 'todo',
        tips: n.tips.map((t) => `- ${t}`).join('\n'),
        tipsModified: false,
        checklist: n.checklist.map((text) => ({
          id: uid('chk'),
          text,
          done: false,
        })),
        notes: '',
      })
    }
  }
  // tag created
  void now
  return nodes
}

export async function createProject(input: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
  const project: Project = {
    ...input,
    id: uid('proj'),
    createdAt: new Date().toISOString(),
  }
  const nodes = await instantiateNodes(project.id)
  await db.transaction('rw', db.projects, db.nodes, async () => {
    await db.projects.add(project)
    await db.nodes.bulkAdd(nodes)
  })
  return project
}

export async function deleteProject(projectId: string): Promise<void> {
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
