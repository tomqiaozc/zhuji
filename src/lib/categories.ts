/**
 * User-customizable purchase categories.
 *
 * Persisted in localStorage so the data layer (Dexie / backend) stays
 * untouched — categories are a UI-side hint, not a relation. Falls back
 * to the built-in defaults if nothing is saved yet so first-run users
 * see the same dropdown they always have.
 *
 * The order in the array IS the user's preferred order; the Settings
 * UI lets them rearrange / add / rename / delete.
 */

const STORAGE_KEY = 'zhuji-purchase-categories-v1'

export const DEFAULT_CATEGORIES = [
  '主材',
  '辅材',
  '家电',
  '家具',
  '软装',
  '五金',
  '工程',
  '人工',
  '设计费',
  '其他',
]

type Listener = (cats: string[]) => void
const listeners = new Set<Listener>()

function safeLoad(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const cleaned = parsed
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    return cleaned.length > 0 ? cleaned : null
  } catch {
    return null
  }
}

function safeSave(cats: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cats))
  } catch {
    // localStorage unavailable / quota — fall through, the in-memory
    // copy will still be honored for this session.
  }
}

let memo: string[] | null = null

export function getCategories(): string[] {
  if (memo) return memo
  memo = safeLoad() ?? [...DEFAULT_CATEGORIES]
  return memo
}

export function setCategories(next: string[]): void {
  const cleaned = next.map((s) => s.trim()).filter((s) => s.length > 0)
  // Dedupe while preserving first occurrence's order.
  const seen = new Set<string>()
  const dedup: string[] = []
  for (const s of cleaned) {
    if (!seen.has(s)) {
      seen.add(s)
      dedup.push(s)
    }
  }
  memo = dedup
  safeSave(dedup)
  for (const l of listeners) l([...dedup])
}

export function resetCategories(): void {
  setCategories([...DEFAULT_CATEGORIES])
}

export function subscribeCategories(l: Listener): () => void {
  listeners.add(l)
  l([...getCategories()])
  return () => listeners.delete(l)
}
