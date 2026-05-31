import dayjs from 'dayjs'
import { db } from '@/db'
import type { Asset, DecorNode, Project, Purchase, Reminder } from '@/types'

interface BackupManifest {
  version: 1
  exportedAt: string
  projects: Project[]
  nodes: DecorNode[]
  purchases: Purchase[]
  reminders: Reminder[]
  assets: { id: string; projectId: string; refType: string; refId: string; fileName: string; mimeType: string; size: number; createdAt: string }[]
}

export async function exportFullZip(): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const [projects, nodes, purchases, reminders, assets] = await Promise.all([
    db.projects.toArray(),
    db.nodes.toArray(),
    db.purchases.toArray(),
    db.reminders.toArray(),
    db.assets.toArray(),
  ])
  const manifest: BackupManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects,
    nodes,
    purchases,
    reminders,
    assets: assets.map((a) => ({
      id: a.id,
      projectId: a.projectId,
      refType: a.refType,
      refId: a.refId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt,
    })),
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  const folder = zip.folder('assets')
  if (folder) {
    for (const a of assets) {
      folder.file(a.id, a.blob, { binary: true })
    }
  }
  return await zip.generateAsync({ type: 'blob' })
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

export async function importFullZip(file: File): Promise<{
  projects: number
  nodes: number
  purchases: number
  reminders: number
  assets: number
}> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file)
  const manifestEntry = zip.file('manifest.json')
  if (!manifestEntry) throw new Error('备份包内缺少 manifest.json')
  const manifest = JSON.parse(await manifestEntry.async('string')) as BackupManifest
  if (manifest.version !== 1) throw new Error(`不支持的备份版本：${manifest.version}`)

  const assets: Asset[] = []
  for (const meta of manifest.assets) {
    const entry = zip.file(`assets/${meta.id}`)
    if (!entry) continue
    const blob = await entry.async('blob')
    assets.push({
      id: meta.id,
      projectId: meta.projectId,
      refType: meta.refType as 'purchase' | 'node',
      refId: meta.refId,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      blob,
      size: meta.size,
      createdAt: meta.createdAt,
    })
  }

  await db.transaction(
    'rw',
    [db.projects, db.nodes, db.purchases, db.reminders, db.assets],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.nodes.clear(),
        db.purchases.clear(),
        db.reminders.clear(),
        db.assets.clear(),
      ])
      await db.projects.bulkAdd(manifest.projects)
      await db.nodes.bulkAdd(manifest.nodes)
      await db.purchases.bulkAdd(manifest.purchases)
      await db.reminders.bulkAdd(manifest.reminders)
      await db.assets.bulkAdd(assets)
    },
  )

  return {
    projects: manifest.projects.length,
    nodes: manifest.nodes.length,
    purchases: manifest.purchases.length,
    reminders: manifest.reminders.length,
    assets: assets.length,
  }
}

// ------------------ PDF export (print-to-PDF) ------------------

function fmtMoneyForPdf(n: number): string {
  return '¥ ' + n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

export async function exportProjectPdf(projectId: string): Promise<void> {
  const [project, nodes, purchases] = await Promise.all([
    db.projects.get(projectId),
    db.nodes.where('projectId').equals(projectId).sortBy('order'),
    db.purchases.where('projectId').equals(projectId).toArray(),
  ])
  if (!project) throw new Error('项目不存在')

  const done = nodes.filter((n) => n.status === 'done').length
  const total = nodes.length
  const totalSpent = purchases.reduce((s, p) => s + (p.totalPrice || 0), 0)
  const byNode = new Map(nodes.map((n) => [n.id, n]))
  const stageGroups = new Map<string, typeof nodes>()
  for (const n of nodes) {
    if (!stageGroups.has(n.stage)) stageGroups.set(n.stage, [])
    stageGroups.get(n.stage)!.push(n)
  }
  const byStageSpend = new Map<string, number>()
  for (const p of purchases) {
    const s = byNode.get(p.nodeId)?.stage ?? '其他'
    byStageSpend.set(s, (byStageSpend.get(s) ?? 0) + p.totalPrice)
  }

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(project.name)} · 装修档案</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2937; font-size: 12px; line-height: 1.55; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d1d5db; }
  h3 { font-size: 13px; margin: 14px 0 6px; color: #374151; }
  .meta { color: #6b7280; font-size: 11px; margin-bottom: 16px; }
  .stats { display: flex; gap: 24px; margin: 16px 0; }
  .stat { flex: 1; padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; background: #f9fafb; }
  .stat .lbl { font-size: 10px; color: #6b7280; }
  .stat .val { font-size: 18px; font-weight: 600; color: #111827; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 11px; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  .right { text-align: right; }
  .tag { display: inline-block; padding: 1px 6px; border-radius: 8px; background: #e5e7eb; font-size: 10px; color: #374151; }
  .status-done { color: #16a34a; }
  .status-doing { color: #2563eb; }
  .status-todo { color: #6b7280; }
  .page-break { page-break-before: always; }
  .footer { margin-top: 32px; font-size: 10px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
  <h1>${escapeHtml(project.name)} · 装修档案</h1>
  <div class="meta">
    ${[
      project.address,
      project.area ? `${project.area} ㎡` : '',
      project.type,
      project.startDate ? `开工 ${project.startDate}` : '',
      project.expectedEndDate ? `预计完工 ${project.expectedEndDate}` : '',
    ].filter(Boolean).join(' · ')}
    <br/>导出于 ${dayjs().format('YYYY-MM-DD HH:mm')}
  </div>

  <div class="stats">
    <div class="stat"><div class="lbl">总节点</div><div class="val">${done}/${total}</div></div>
    <div class="stat"><div class="lbl">累计支出</div><div class="val">${fmtMoneyForPdf(totalSpent)}</div></div>
    <div class="stat"><div class="lbl">采购笔数</div><div class="val">${purchases.length}</div></div>
  </div>

  <h2>各阶段花费</h2>
  <table>
    <thead><tr><th>阶段</th><th class="right">金额</th><th class="right">占比</th></tr></thead>
    <tbody>
      ${[...byStageSpend.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(
          ([s, v]) =>
            `<tr><td>${escapeHtml(s)}</td><td class="right">${fmtMoneyForPdf(v)}</td><td class="right">${totalSpent ? ((v / totalSpent) * 100).toFixed(1) : '0'}%</td></tr>`,
        )
        .join('')}
    </tbody>
  </table>

  <h2>节点进度</h2>
  ${[...stageGroups.entries()]
    .map(
      ([stage, list]) => `
    <h3>${escapeHtml(stage)}</h3>
    <table>
      <thead><tr><th>节点</th><th>状态</th><th>计划</th><th>实际</th></tr></thead>
      <tbody>
        ${list
          .map(
            (n) => `
          <tr>
            <td>${escapeHtml(n.name)}</td>
            <td class="status-${n.status}">${statusLabel(n.status)}</td>
            <td>${(n.plannedStart ?? '—') + ' → ' + (n.plannedEnd ?? '—')}</td>
            <td>${(n.actualStart ?? '—') + ' → ' + (n.actualEnd ?? '—')}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>`,
    )
    .join('')}

  <h2 class="page-break">采购流水（${purchases.length}）</h2>
  <table>
    <thead><tr><th>日期</th><th>商品</th><th>品牌</th><th>品类</th><th>节点</th><th class="right">金额</th></tr></thead>
    <tbody>
      ${purchases
        .slice()
        .sort((a, b) => (a.purchaseDate < b.purchaseDate ? 1 : -1))
        .map((p) => {
          const n = byNode.get(p.nodeId)
          return `<tr>
            <td>${escapeHtml(p.purchaseDate)}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.brand ?? '—')}</td>
            <td><span class="tag">${escapeHtml(p.category)}</span></td>
            <td>${escapeHtml(n ? `${n.stage} / ${n.name}` : '—')}</td>
            <td class="right">${fmtMoneyForPdf(p.totalPrice)}</td>
          </tr>`
        })
        .join('')}
    </tbody>
  </table>

  <div class="footer">由 筑迹 Zhuji 生成 · 浏览器打印为 PDF 即可保存</div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 200)
    })
  </script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    alert('浏览器拦截了弹窗，请允许弹窗后重试')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

function statusLabel(s: string): string {
  switch (s) {
    case 'done':
      return '已完成'
    case 'doing':
      return '进行中'
    case 'skipped':
      return '已跳过'
    default:
      return '未开始'
  }
}

function escapeHtml(s: string | undefined | null): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
