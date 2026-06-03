export type NodeStatus = 'todo' | 'doing' | 'done' | 'skipped'

export type ProjectType = '毛坯' | '老房改造' | '局部翻新'

export interface Project {
  id: string
  name: string
  address?: string
  area?: number
  type?: ProjectType
  startDate?: string
  expectedEndDate?: string
  /** Total renovation budget (CNY). Optional; renders the budget-vs-actual
   *  card on Dashboard when set. */
  budget?: number
  createdAt: string
}

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
  note?: string
}

export interface DecorNode {
  id: string
  projectId: string
  stage: string
  name: string
  order: number
  status: NodeStatus
  plannedStart?: string
  plannedEnd?: string
  actualStart?: string
  actualEnd?: string
  tips: string
  tipsModified: boolean
  checklist: ChecklistItem[]
  notes: string
}

export interface Purchase {
  id: string
  projectId: string
  nodeId: string
  name: string
  spec?: string
  brand?: string
  channel?: string
  category: string
  unitPrice: number
  quantity: number
  totalPrice: number
  purchaseDate?: string
  purchaseUrl?: string
  remark?: string
  createdAt: string
}

export interface Reminder {
  id: string
  projectId: string
  nodeId?: string
  title: string
  triggerAt: string
  repeated?: 'none' | 'daily' | 'weekly'
  done: boolean
}

export interface StageTemplateNode {
  name: string
  tips: string[]
  checklist: string[]
}

export interface StageTemplate {
  stage: string
  icon: string
  nodes: StageTemplateNode[]
}
