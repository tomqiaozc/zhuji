// User-editable stage templates layered on top of the built-in defaults.
// Changes are persisted in localStorage and only affect NEW projects (existing
// project nodes are already materialized into Dexie). "恢复出厂模板" clears
// the override so getActiveTemplates() falls back to STAGE_TEMPLATES.

import { STAGE_TEMPLATES } from './templates'
import type { StageTemplate } from '@/types'

const LS_KEY = 'zhuji-stage-templates-v1'

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

export function loadCustomTemplates(): StageTemplate[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed as StageTemplate[]
  } catch {
    return null
  }
}

export function saveCustomTemplates(templates: StageTemplate[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(templates))
}

export function resetTemplates(): void {
  localStorage.removeItem(LS_KEY)
}

export function getActiveTemplates(): StageTemplate[] {
  return loadCustomTemplates() ?? deepClone(STAGE_TEMPLATES)
}

export function getDefaultTemplates(): StageTemplate[] {
  return deepClone(STAGE_TEMPLATES)
}

export function isCustomized(): boolean {
  return loadCustomTemplates() !== null
}
