import { getActiveTemplates } from '@/data/userTemplates'
import {
  createProject as repoCreateProject,
  deleteProject as repoDeleteProject,
  hydrateProject,
  initProjectFromTemplate,
  type InitTemplateNode,
} from '@/lib/repository'
import type { Project } from '@/types'

/**
 * Create a project (server-side) and seed it with the active stage
 * templates as 62 nodes + ~538 checklist items.
 *
 * Implementation note: this used to fan out ~600 sequential HTTP calls
 * (one per node + one per checklist item), which made new-project
 * creation take ~5 minutes from the browser. The new flow is **three**
 * round-trips total — `POST /api/projects` → `POST /api/projects/:id/
 * init-from-template` (one transaction on the backend) → hydrate.
 */
export async function createProject(input: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
  const project = await repoCreateProject(input)

  const templateNodes: InitTemplateNode[] = []
  for (const stage of getActiveTemplates()) {
    for (const n of stage.nodes) {
      templateNodes.push({
        stage: stage.stage,
        name: n.name,
        status: 'todo',
        tips: n.tips.map((t) => `- ${t}`).join('\n'),
        tipsModified: false,
        notes: '',
        checklist: n.checklist.map((text) => ({ text, done: false })),
      })
    }
  }

  await initProjectFromTemplate(project.id, templateNodes)
  // Hydrate so order / IDs are authoritative locally — single endpoint
  // call from the helper, not 62 individual GETs.
  await hydrateProject(project.id)
  return project
}

export async function deleteProject(projectId: string): Promise<void> {
  await repoDeleteProject(projectId)
}
