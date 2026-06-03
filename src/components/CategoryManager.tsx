import { useEffect, useState } from 'react'
import {
  DEFAULT_CATEGORIES,
  getCategories,
  resetCategories,
  setCategories as saveCategories,
  subscribeCategories,
} from '@/lib/categories'

/** Settings panel widget: add / rename / reorder / delete purchase categories. */
export function CategoryManager() {
  const [cats, setCats] = useState<string[]>(() => getCategories())
  const [adding, setAdding] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')

  useEffect(() => subscribeCategories(setCats), [])

  function add() {
    const t = adding.trim()
    if (!t || cats.includes(t)) {
      setAdding('')
      return
    }
    saveCategories([...cats, t])
    setAdding('')
  }

  function remove(i: number) {
    const next = cats.filter((_, idx) => idx !== i)
    saveCategories(next.length === 0 ? [...DEFAULT_CATEGORIES] : next)
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= cats.length) return
    const next = [...cats]
    ;[next[i], next[j]] = [next[j], next[i]]
    saveCategories(next)
  }

  function startEdit(i: number) {
    setEditingIdx(i)
    setEditingText(cats[i])
  }

  function commitEdit() {
    if (editingIdx == null) return
    const t = editingText.trim()
    if (!t) {
      setEditingIdx(null)
      return
    }
    const next = [...cats]
    next[editingIdx] = t
    saveCategories(next)
    setEditingIdx(null)
  }

  return (
    <div data-testid="category-manager">
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '0 0 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {cats.map((c, i) => (
          <li
            key={`${c}-${i}`}
            data-testid={`category-row-${c}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--panel)',
            }}
          >
            <span style={{ width: 24, color: 'var(--text-soft)', fontSize: 12 }}>{i + 1}.</span>
            {editingIdx === i ? (
              <input
                type="text"
                value={editingText}
                autoFocus
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) commitEdit()
                  if (e.key === 'Escape') setEditingIdx(null)
                }}
                onBlur={commitEdit}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 4,
                  fontSize: 13,
                }}
              />
            ) : (
              <span style={{ flex: 1, fontSize: 14 }}>{c}</span>
            )}
            <button
              className="icon-btn"
              title="上移"
              aria-label="上移"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              className="icon-btn"
              title="下移"
              aria-label="下移"
              disabled={i === cats.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              className="icon-btn"
              title="重命名"
              aria-label="重命名"
              onClick={() => startEdit(i)}
            >
              ✎
            </button>
            <button
              className="icon-btn"
              title="删除"
              aria-label="删除"
              data-testid={`category-delete-${c}`}
              onClick={() => remove(i)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) add()
          }}
          placeholder="新增品类"
          data-testid="category-new-input"
          style={{
            flex: 1,
            padding: '6px 10px',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            fontSize: 13,
          }}
        />
        <button
          className="btn btn-primary btn-sm"
          data-testid="category-add"
          onClick={add}
          disabled={!adding.trim()}
        >
          添加
        </button>
        <button
          className="btn btn-sm"
          data-testid="category-reset"
          onClick={resetCategories}
          title="恢复默认品类"
        >
          恢复默认
        </button>
      </div>
    </div>
  )
}
