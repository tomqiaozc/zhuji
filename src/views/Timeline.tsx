import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import { db } from '@/db'
import { updateNode } from '@/lib/repository'
import { pushToast } from '@/lib/toast'
import type { DecorNode, Project } from '@/types'

interface Props {
  project: Project
}

const STATUS_COLOR: Record<string, string> = {
  todo: '#cbd5e1',
  doing: '#2563eb',
  done: '#16a34a',
  skipped: '#94a3b8',
}

type DragKind = 'move' | 'start' | 'end'

interface DragState {
  nodeId: string
  kind: DragKind
  originStart: string
  originEnd: string
  startX: number
  dayWidth: number
  field: 'planned' | 'actual'
}

export function Timeline({ project }: Props) {
  const nodes =
    useLiveQuery(
      () => db.nodes.where('projectId').equals(project.id).sortBy('order'),
      [project.id],
    ) ?? []
  const [mode, setMode] = useState<'planned' | 'actual'>('planned')
  const [draft, setDraft] = useState<Record<string, { start: string; end: string }>>({})
  const dragRef = useRef<DragState | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const items = useMemo(() => {
    return nodes.map((n) => {
      const d = draft[n.id]
      if (d) return { node: n, start: d.start, end: d.end }
      const start = mode === 'planned' ? n.plannedStart : (n.actualStart ?? n.plannedStart)
      const end =
        mode === 'planned'
          ? n.plannedEnd
          : (n.actualEnd ??
            (n.status === 'doing' ? dayjs().format('YYYY-MM-DD') : (n.plannedEnd ?? n.actualStart)))
      return { node: n, start, end }
    })
  }, [nodes, mode, draft])

  const valid = items.filter((i) => i.start && i.end) as {
    node: DecorNode
    start: string
    end: string
  }[]

  const range = useMemo(() => {
    if (valid.length === 0) return null
    let min = dayjs(valid[0].start)
    let max = dayjs(valid[0].end)
    for (const v of valid) {
      const s = dayjs(v.start)
      const e = dayjs(v.end)
      if (s.isBefore(min)) min = s
      if (e.isAfter(max)) max = e
    }
    min = min.subtract(2, 'day')
    max = max.add(2, 'day')
    return { min, max, totalDays: max.diff(min, 'day') + 1 }
  }, [valid])

  if (!range) {
    return (
      <section className="view">
        <div className="view-header">
          <div>
            <h1 className="view-title">时间轴</h1>
            <div className="view-subtitle">尚未设置任何节点的计划日期</div>
          </div>
        </div>
        <div className="card">
          <div className="empty">
            打开「节点工作台」给每个节点设置计划开始 / 完成日期后，这里会展示甘特图。
          </div>
        </div>
      </section>
    )
  }

  const ROW_H = 28
  const LEFT = 240
  const RIGHT_PAD = 16
  const dayWidth = Math.max(8, Math.min(28, 900 / range.totalDays))
  const width = LEFT + range.totalDays * dayWidth + RIGHT_PAD
  const height = valid.length * ROW_H + 56

  const monthMarks: { x: number; label: string }[] = []
  let cursor = range.min.startOf('month')
  while (cursor.isBefore(range.max) || cursor.isSame(range.max, 'day')) {
    const x = LEFT + cursor.diff(range.min, 'day') * dayWidth
    monthMarks.push({ x, label: cursor.format('YYYY-MM') })
    cursor = cursor.add(1, 'month')
  }

  const todayX = LEFT + dayjs().diff(range.min, 'day') * dayWidth
  const todayVisible = todayX >= LEFT && todayX <= width - RIGHT_PAD

  function onBarPointerDown(e: React.PointerEvent, node: DecorNode, kind: DragKind) {
    e.preventDefault()
    ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
    const start = mode === 'planned' ? node.plannedStart : node.actualStart
    const end = mode === 'planned' ? node.plannedEnd : node.actualEnd
    if (!start || !end) return
    dragRef.current = {
      nodeId: node.id,
      kind,
      originStart: start,
      originEnd: end,
      startX: e.clientX,
      dayWidth,
      field: mode,
    }
  }

  function onBarPointerMove(e: React.PointerEvent) {
    const s = dragRef.current
    if (!s) return
    const deltaDays = Math.round((e.clientX - s.startX) / s.dayWidth)
    let newStart = s.originStart
    let newEnd = s.originEnd
    if (s.kind === 'move') {
      newStart = dayjs(s.originStart).add(deltaDays, 'day').format('YYYY-MM-DD')
      newEnd = dayjs(s.originEnd).add(deltaDays, 'day').format('YYYY-MM-DD')
    } else if (s.kind === 'start') {
      newStart = dayjs(s.originStart).add(deltaDays, 'day').format('YYYY-MM-DD')
      if (dayjs(newStart).isAfter(s.originEnd)) newStart = s.originEnd
    } else if (s.kind === 'end') {
      newEnd = dayjs(s.originEnd).add(deltaDays, 'day').format('YYYY-MM-DD')
      if (dayjs(newEnd).isBefore(s.originStart)) newEnd = s.originStart
    }
    setDraft((d) => ({ ...d, [s.nodeId]: { start: newStart, end: newEnd } }))
  }

  async function onBarPointerUp(e: React.PointerEvent) {
    const s = dragRef.current
    if (!s) return
    ;(e.currentTarget as SVGElement).releasePointerCapture(e.pointerId)
    dragRef.current = null
    const d = draft[s.nodeId]
    setDraft((prev) => {
      const next = { ...prev }
      delete next[s.nodeId]
      return next
    })
    if (!d) return
    if (d.start === s.originStart && d.end === s.originEnd) return
    const patch: Partial<DecorNode> =
      s.field === 'planned'
        ? { plannedStart: d.start, plannedEnd: d.end }
        : { actualStart: d.start, actualEnd: d.end }
    try {
      await updateNode(s.nodeId, patch)
      const label = s.field === 'planned' ? '计划' : '实际'
      pushToast(`${label}日期已更新：${d.start} → ${d.end}`, 'success', 2400)
    } catch (err) {
      pushToast(`保存失败：${(err as Error)?.message ?? ''}`, 'error', 6000)
    }
  }

  // ESC cancels an in-progress drag without committing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const s = dragRef.current
      if (!s) return
      dragRef.current = null
      setDraft((prev) => {
        if (!(s.nodeId in prev)) return prev
        const next = { ...prev }
        delete next[s.nodeId]
        return next
      })
      pushToast('已取消拖拽', 'info', 1800)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <section className="view">
      <div className="view-header">
        <div>
          <h1 className="view-title">时间轴</h1>
          <div className="view-subtitle">
            {valid.length} / {nodes.length} 个节点有日期，{range.totalDays} 天 · 拖拽色条调整日期
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`btn btn-sm ${mode === 'planned' ? 'btn-primary' : ''}`}
            onClick={() => setMode('planned')}
          >
            计划
          </button>
          <button
            className={`btn btn-sm ${mode === 'actual' ? 'btn-primary' : ''}`}
            onClick={() => setMode('actual')}
          >
            实际
          </button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'auto', padding: 0 }}>
        <svg ref={svgRef} width={width} height={height} className="gantt-svg">
          {monthMarks.map((m, i) => (
            <g key={i}>
              <line x1={m.x} y1={0} x2={m.x} y2={height} stroke="#e5e7eb" strokeWidth={1} />
              <text x={m.x + 4} y={14} fontSize={11} fill="#6b7280">
                {m.label}
              </text>
            </g>
          ))}

          {todayVisible && (
            <g>
              <line
                x1={todayX}
                y1={20}
                x2={todayX}
                y2={height}
                stroke="#ef4444"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <text x={todayX + 4} y={32} fontSize={10} fill="#ef4444">
                今天
              </text>
            </g>
          )}

          {valid.map((v, i) => {
            const y = 36 + i * ROW_H
            const x1 = LEFT + dayjs(v.start).diff(range.min, 'day') * dayWidth
            const x2 = LEFT + (dayjs(v.end).diff(range.min, 'day') + 1) * dayWidth
            const barW = Math.max(2, x2 - x1)
            const handleW = Math.max(4, Math.min(8, dayWidth * 0.6))
            const draggable = !!(v.start && v.end)
            return (
              <g key={v.node.id}>
                <rect
                  x={0}
                  y={y - 4}
                  width={width}
                  height={ROW_H}
                  fill={i % 2 ? '#f9fafb' : '#fff'}
                />
                <text
                  x={12}
                  y={y + 14}
                  fontSize={12}
                  fill="#111827"
                  style={{ pointerEvents: 'none' }}
                >
                  <tspan fill="#6b7280">{v.node.stage}</tspan> · {v.node.name}
                </text>
                <rect
                  x={x1}
                  y={y + 4}
                  width={barW}
                  height={ROW_H - 12}
                  rx={4}
                  fill={STATUS_COLOR[v.node.status] ?? '#cbd5e1'}
                  opacity={v.node.status === 'todo' ? 0.55 : 0.95}
                  data-testid={`gantt-bar-${v.node.id}`}
                  style={{ cursor: draggable ? 'grab' : 'default' }}
                  onPointerDown={(e) => draggable && onBarPointerDown(e, v.node, 'move')}
                  onPointerMove={onBarPointerMove}
                  onPointerUp={onBarPointerUp}
                >
                  <title>
                    {v.node.name} · {v.start} → {v.end} · {v.node.status}
                  </title>
                </rect>
                {/* drag handles */}
                <rect
                  x={x1}
                  y={y + 4}
                  width={handleW}
                  height={ROW_H - 12}
                  fill="transparent"
                  data-testid={`gantt-handle-start-${v.node.id}`}
                  style={{ cursor: draggable ? 'ew-resize' : 'default' }}
                  onPointerDown={(e) => draggable && onBarPointerDown(e, v.node, 'start')}
                  onPointerMove={onBarPointerMove}
                  onPointerUp={onBarPointerUp}
                />
                <rect
                  x={x1 + barW - handleW}
                  y={y + 4}
                  width={handleW}
                  height={ROW_H - 12}
                  fill="transparent"
                  data-testid={`gantt-handle-end-${v.node.id}`}
                  style={{ cursor: draggable ? 'ew-resize' : 'default' }}
                  onPointerDown={(e) => draggable && onBarPointerDown(e, v.node, 'end')}
                  onPointerMove={onBarPointerMove}
                  onPointerUp={onBarPointerUp}
                />
              </g>
            )
          })}
        </svg>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 className="card-title">图例</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          {(['done', 'doing', 'todo', 'skipped'] as const).map((s) => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 14,
                  height: 12,
                  borderRadius: 3,
                  background: STATUS_COLOR[s],
                  display: 'inline-block',
                }}
              />
              {s === 'done'
                ? '已完成'
                : s === 'doing'
                  ? '进行中'
                  : s === 'todo'
                    ? '未开始'
                    : '已跳过'}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
