import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import { db } from '@/db'
import { uid } from '@/lib/uid'
import { fmtMoney } from '@/lib/format'
import { compressImage } from '@/lib/image'
import { pushToast } from '@/lib/toast'
import type { Project, Purchase, Asset } from '@/types'

interface Props {
  project: Project
  presetNodeId?: string
  editing?: Purchase
  onClose: () => void
}

const DEFAULT_CATEGORIES = ['主材', '辅材', '家电', '家具', '软装', '五金', '工程', '其他']

export function PurchaseDrawer({ project, presetNodeId, editing, onClose }: Props) {
  const nodes =
    useLiveQuery(
      () => db.nodes.where('projectId').equals(project.id).sortBy('order'),
      [project.id],
    ) ?? []

  const [nodeId, setNodeId] = useState<string>(editing?.nodeId ?? presetNodeId ?? '')
  const [name, setName] = useState(editing?.name ?? '')
  const [spec, setSpec] = useState(editing?.spec ?? '')
  const [brand, setBrand] = useState(editing?.brand ?? '')
  const [channel, setChannel] = useState(editing?.channel ?? '')
  const [category, setCategory] = useState(editing?.category ?? '主材')
  const [unitPrice, setUnitPrice] = useState(editing ? String(editing.unitPrice) : '')
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : '1')
  const [purchaseDate, setPurchaseDate] = useState(
    editing?.purchaseDate ?? dayjs().format('YYYY-MM-DD'),
  )
  const [purchaseUrl, setPurchaseUrl] = useState(editing?.purchaseUrl ?? '')
  const [remark, setRemark] = useState(editing?.remark ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingImages, setPendingImages] = useState<{ id: string; file: File }[]>([])
  const [imageIds, setImageIds] = useState<string[]>(editing?.imageIds ?? [])
  const blobUrlsRef = useRef<Map<string, string>>(new Map())

  const existingPreviews = useLiveQuery(async () => {
    if (!editing || imageIds.length === 0) return [] as Asset[]
    const rows = await db.assets.bulkGet(imageIds)
    return rows.filter((a): a is Asset => !!a)
  }, [editing?.id, imageIds.join(',')]) ?? []

  function urlFor(a: Asset): string {
    const cached = blobUrlsRef.current.get(a.id)
    if (cached) return cached
    const url = URL.createObjectURL(a.blob)
    blobUrlsRef.current.set(a.id, url)
    return url
  }

  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current.values()) URL.revokeObjectURL(url)
      blobUrlsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function pendingPreview(p: { id: string; file: File }) {
    if (!blobUrlsRef.current.has(p.id)) {
      blobUrlsRef.current.set(p.id, URL.createObjectURL(p.file))
    }
    return blobUrlsRef.current.get(p.id)!
  }

  async function onAddImages(fl: FileList | null) {
    if (!fl) return
    const next: { id: string; file: File }[] = []
    const newIds: string[] = []
    for (const f of Array.from(fl)) {
      if (!f.type.startsWith('image/')) continue
      const c = await compressImage(f)
      const id = uid('ast')
      if (editing) {
        const asset: Asset = {
          id,
          projectId: project.id,
          refType: 'purchase',
          refId: editing.id,
          fileName: c.name,
          mimeType: c.type,
          blob: c,
          size: c.size,
          createdAt: new Date().toISOString(),
        }
        await db.assets.add(asset)
        newIds.push(id)
      } else {
        next.push({ id, file: c })
        newIds.push(id)
      }
    }
    if (next.length > 0) setPendingImages((p) => [...p, ...next])
    if (newIds.length > 0) {
      const merged = [...imageIds, ...newIds]
      setImageIds(merged)
      if (editing) await db.purchases.update(editing.id, { imageIds: merged })
    }
  }

  async function onRemoveImage(id: string) {
    const url = blobUrlsRef.current.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      blobUrlsRef.current.delete(id)
    }
    setPendingImages((p) => p.filter((x) => x.id !== id))
    const next = imageIds.filter((x) => x !== id)
    setImageIds(next)
    try {
      await db.assets.delete(id)
    } catch {
      // pending, never persisted
    }
    if (editing) await db.purchases.update(editing.id, { imageIds: next })
  }

  useEffect(() => {
    if (!nodeId && nodes.length > 0) setNodeId(nodes[0].id)
  }, [nodes, nodeId])

  const totalPrice = useMemo(() => {
    const u = Number(unitPrice) || 0
    const q = Number(quantity) || 0
    return Math.round(u * q * 100) / 100
  }, [unitPrice, quantity])

  async function save() {
    if (!name.trim() || !nodeId) {
      setError('请填写商品名称并选择所属节点')
      return
    }
    const u = Number(unitPrice)
    const q = Number(quantity)
    if (!unitPrice.trim() || !Number.isFinite(u) || u <= 0) {
      setError('单价必须大于 0')
      return
    }
    if (!quantity.trim() || !Number.isFinite(q) || q <= 0) {
      setError('数量必须大于 0')
      return
    }
    if (!purchaseDate) {
      setError('请选择购买日期')
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (editing) {
        const patch: Partial<Purchase> = {
          nodeId,
          name: name.trim(),
          spec: spec.trim() || undefined,
          brand: brand.trim() || undefined,
          channel: channel.trim() || undefined,
          category,
          unitPrice: u,
          quantity: q,
          totalPrice,
          purchaseDate,
          purchaseUrl: purchaseUrl.trim() || undefined,
          remark: remark.trim() || undefined,
          imageIds,
        }
        await db.purchases.update(editing.id, patch)
        pushToast('已保存采购记录', 'success', 2400)
      } else {
        const purchaseId = uid('pur')
        // Commit pending images now that we know the real purchase id.
        for (const pend of pendingImages) {
          const asset: Asset = {
            id: pend.id,
            projectId: project.id,
            refType: 'purchase',
            refId: purchaseId,
            fileName: pend.file.name,
            mimeType: pend.file.type,
            blob: pend.file,
            size: pend.file.size,
            createdAt: new Date().toISOString(),
          }
          await db.assets.add(asset)
        }
        const p: Purchase = {
          id: purchaseId,
          projectId: project.id,
          nodeId,
          name: name.trim(),
          spec: spec.trim() || undefined,
          brand: brand.trim() || undefined,
          channel: channel.trim() || undefined,
          category,
          unitPrice: u,
          quantity: q,
          totalPrice,
          purchaseDate,
          purchaseUrl: purchaseUrl.trim() || undefined,
          imageIds,
          remark: remark.trim() || undefined,
          createdAt: new Date().toISOString(),
        }
        await db.purchases.add(p)
        pushToast('已记录新采购', 'success', 2400)
      }
      onClose()
    } catch (e) {
      const msg = (e as Error)?.message ?? '未知错误'
      setError(`写入失败：${msg}`)
      pushToast(`保存失败：${msg}`, 'error', 6000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="drawer-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-header">
          <div className="drawer-title">{editing ? '编辑采购' : '记一笔采购'}</div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="form-row">
          <label>商品名称 *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：马可波罗 通体大理石瓷砖"
            autoFocus
          />
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>规格</label>
            <input
              type="text"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              placeholder="800x800"
            />
          </div>
          <div className="form-row">
            <label>品牌</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="马可波罗"
            />
          </div>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>所属节点 *</label>
            <select value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.stage} / {n.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>品类</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {DEFAULT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>单价 ¥ *</label>
            <input
              type="number"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="160"
              step="0.01"
            />
          </div>
          <div className="form-row">
            <label>数量 *</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="80"
              step="0.01"
            />
          </div>
        </div>
        <div className="form-row">
          <label>总价（自动计算）</label>
          <input type="text" value={fmtMoney(totalPrice)} readOnly style={{ background: '#f9fafb' }} />
        </div>
        <div className="form-grid">
          <div className="form-row">
            <label>购买日期 *</label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>购买渠道</label>
            <input
              type="text"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="天猫 / 京东 / 实体店"
            />
          </div>
        </div>
        <div className="form-row">
          <label>购买链接</label>
          <input
            type="url"
            value={purchaseUrl}
            onChange={(e) => setPurchaseUrl(e.target.value)}
            placeholder="https://detail.tmall.com/item.htm?id=..."
          />
        </div>
        <div className="form-row">
          <label>备注</label>
          <textarea
            rows={3}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="尺寸、安装注意事项…"
          />
        </div>
        <div className="form-row">
          <label>实物图片</label>
          <div className="image-thumb-grid">
            {existingPreviews.map((a) => (
              <div key={a.id} className="image-thumb">
                <img src={urlFor(a)} alt={a.fileName} />
                <button
                  className="remove"
                  onClick={() => onRemoveImage(a.id)}
                  aria-label="移除图片"
                >
                  ✕
                </button>
              </div>
            ))}
            {pendingImages.map((p) => (
              <div key={p.id} className="image-thumb">
                <img src={pendingPreview(p)} alt={p.file.name} />
                <button
                  className="remove"
                  onClick={() => onRemoveImage(p.id)}
                  aria-label="移除图片"
                >
                  ✕
                </button>
              </div>
            ))}
            <label className="image-add" title="添加图片">
              + 加图
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  void onAddImages(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
        <div className="drawer-actions">
          {error && (
            <span style={{ color: 'var(--danger, #dc2626)', fontSize: 13, marginRight: 'auto' }}>
              {error}
            </span>
          )}
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={!name.trim() || !nodeId || busy}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
