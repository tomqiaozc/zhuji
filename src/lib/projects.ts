import { getActiveTemplates } from '@/data/userTemplates'
import {
  createProject as repoCreateProject,
  createNode as repoCreateNode,
  deleteProject as repoDeleteProject,
  hydrateProject,
} from '@/lib/repository'
import type { ChecklistItem, Project } from '@/types'

/**
 * Create a project (server-side) and instantiate the active stage templates
 * as 62 nodes + each node's checklist items. Returns the new project once
 * the local cache has caught up — UI views can `useLiveQuery` immediately.
 */
export async function createProject(input: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
  const project = await repoCreateProject(input)
  let order = 0
  for (const stage of getActiveTemplates()) {
    for (const n of stage.nodes) {
      // The repository handles checklist creation in order.
      const checklist: Array<Pick<ChecklistItem, 'text' | 'done'>> = n.checklist.map((text) => ({
        text,
        done: false,
      }))
      await repoCreateNode(
        project.id,
        {
          stage: stage.stage,
          name: n.name,
          order: order++,
          status: 'todo',
          tips: n.tips.map((t) => `- ${t}`).join('\n'),
          tipsModified: false,
          notes: '',
        },
        checklist,
      )
    }
  }
  // Refresh local cache for this project so order / IDs are authoritative.
  await hydrateProject(project.id)
  return project
}

export async function deleteProject(projectId: string): Promise<void> {
  await repoDeleteProject(projectId)
}
