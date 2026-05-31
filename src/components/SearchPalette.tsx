import { useEffect, useMemo, useRef, useState } from 'react'
import MiniSearch from 'minisearch'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useApp } from '@/store/app'

interface Props {
  projectId: string
  onClose: () => void
  onJumpNode: (nodeId: string) => void
}

interface Doc {
  id: string
  kind: 'node' | 'purchase' | 'tip' | 'note'
  title: string
  body: string
  nodeId: string
  meta?: string
}

// 中文字级 + 英数词级混合分词：让单字检索也能命中
function tokenize(text: string): string[] {
  const tokens: string[] = []
  if (!text) return tokens
  for (const word of text.toLowerCase().split(/[\s,，.。;；!！?？:：、/\-—_()（）"'"'`<>{}\[\]]+/)) {
    if (!word) continue
    // 全英数：直接作为一个 token
    if (/^[a-z0-9.]+$/.test(word)) {
      tokens.push(word)
      continue
    }
    // 含中文：按字拆 + 整词
    tokens.push(word)
    for (const ch of word) {
      if (/[一-鿿]/.test(ch)) tokens.push(ch)
    }
  }
  return tokens
}

export function SearchPalette({ projectId, onClose, onJumpNode }: Props) {
  const { setView } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  const nodes =
    useLiveQuery(() => db.nodes.where('projectId').equals(projectId).toArray(), [projectId]) ?? []
  const purchases =
    useLiveQuery(() => db.purchases.where('projectId').equals(projectId).toArray(), [projectId]) ??
    []

  const docs = useMemo<Doc[]>(() => {
    const out: Doc[] = []
    for (const n of nodes) {
      out.push({
        id: 'n:' + n.id,
        kind: 'node',
        title: `${n.stage} / ${n.name}`,
        body: n.name + ' ' + n.stage,
        nodeId: n.id,
      })
      const tips = n.tips
        .split('\n')
        .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
        .filter(Boolean)
      tips.forEach((t, i) => {
        out.push({
          id: `t:${n.id}:${i}`,
          kind: 'tip',
          title: t.slice(0, 40),
          body: t,
          nodeId: n.id,
          meta: `${n.stage} / ${n.name} · 避坑`,
        })
      })
      if (n.notes && n.notes.trim()) {
        out.push({
          id: `note:${n.id}`,
          kind: 'note',
          title: n.notes.slice(0, 40),
          body: n.notes,
          nodeId: n.id,
          meta: `${n.stage} / ${n.name} · 备注`,
        })
      }
    }
    for (const p of purchases) {
      const node = nodes.find((n) => n.id === p.nodeId)
      out.push({
        id: 'p:' + p.id,
        kind: 'purchase',
        title: p.name + (p.brand ? ` · ${p.brand}` : ''),
        body: [p.name, p.brand, p.spec, p.channel, p.remark, p.category].filter(Boolean).join(' '),
        nodeId: p.nodeId,
        meta: node ? `${node.stage} / ${node.name}` : '采购',
      })
    }
    return out
  }, [nodes, purchases])

  const mini = useMemo(() => {
    const m = new MiniSearch<Doc>({
      fields: ['title', 'body'],
      storeFields: ['title', 'kind', 'nodeId', 'meta'],
      tokenize,
      processTerm: (t) => t.toLowerCase(),
      searchOptions: {
        prefix: true,
        fuzzy: 0.15,
      },
    })
    m.addAll(docs)
    return m
  }, [docs])

  const results = useMemo(() => {
    if (!q.trim()) return docs.slice(0, 30).map((d) => ({ ...d, score: 0 }))
    return mini.search(q.trim()).slice(0, 30) as unknown as (Doc & { score: number })[]
  }, [q, mini, docs])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => setActiveIdx(0), [q])

  function jump(r: Doc) {
    if (r.kind === 'purchase') {
      setView('purchase')
    } else {
      setView('node')
      onJumpNode(r.nodeId)
    }
    onClose()
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const r = results[activeIdx]
      if (r) jump(r as unknown as Doc)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="modal-bg search-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-palette" role="dialog" aria-modal="true">
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={handleKey}
          placeholder="搜索节点、采购、避坑要点、备注…  (Esc 关闭)"
          data-testid="search-input"
        />
        <div className="search-results">
          {results.length === 0 ? (
            <div className="empty">没有匹配</div>
          ) : (
            results.map((r, i) => {
              const d = r as unknown as Doc
              return (
                <div
                  key={r.id}
                  className={`search-item ${i === activeIdx ? 'active' : ''}`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => jump(d)}
                >
                  <span className={`kind-badge kind-${d.kind}`}>{labelOf(d.kind)}</span>
                  <div className="meta">
                    <div className="t">{d.title}</div>
                    {d.meta && <div className="s">{d.meta}</div>}
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="search-foot">
          ↑↓ 切换 · ⏎ 跳转 · Esc 关闭 · 共 {results.length} 条
        </div>
      </div>
    </div>
  )
}

function labelOf(k: Doc['kind']): string {
  switch (k) {
    case 'node':
      return '节点'
    case 'purchase':
      return '采购'
    case 'tip':
      return '避坑'
    case 'note':
      return '备注'
  }
}
