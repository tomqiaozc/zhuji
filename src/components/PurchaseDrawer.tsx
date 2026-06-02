import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import dayjs from 'dayjs'
import { db } from '@/db'
import { createPurchase, updatePurchase } from '@/lib/repository'
import { fmtMoney } from '@/lib/format'
import { pushToast } from '@/lib/toast'
import type { Project, Purchase } from '@/types'
import { Modal } from './ui/Modal'

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
        await updatePurchase(editing.id, {
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
        })
        pushToast('已保存采购记录', 'success', 2400)
      } else {
        await createPurchase(project.id, {
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
        })
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
    <Modal onClose={onClose} variant="drawer" labelledBy="purchase-drawer-title">
      <div
        onKeyDown={(e) => {
          // Enter shortcut for "save". Limit to <input> targets only so:
          // - clicking 保存 / 取消 with the keyboard doesn't double-fire
          //   (button's own Enter handler is the click); we'd otherwise
          //   call save() twice and risk a duplicate createPurchase.
          // - <textarea> / <select> keep their native Enter semantics.
          // Also skip while the IME is composing.
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
          const t = e.target as HTMLElement
          if (t.tagName !== 'INPUT') return
          e.preventDefault()
          if (!busy) void save()
        }}
      >
        <div className="drawer-header">
          <h2 id="purchase-drawer-title" className="drawer-title">
            {editing ? '编辑采购' : '记一笔采购'}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="form-row">
          <label>商品名称 *</label>
          <input
            type="text"
            data-testid="purchase-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="如：马可波罗 通体大理石瓷砖"
            data-autofocus
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
            data-testid="purchase-unit-price"
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
            data-testid="purchase-quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="80"
            step="0.01"
          />
        </div>
      </div>
      <div className="form-row">
        <label>总价（自动计算）</label>
        <input
          type="text"
          value={fmtMoney(totalPrice)}
          readOnly
          style={{ background: '#f9fafb' }}
        />
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
          data-testid="purchase-save"
          onClick={save}
          disabled={!name.trim() || !nodeId || busy}
        >
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
      </div>
    </Modal>
  )
}
