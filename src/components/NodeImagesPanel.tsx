/**
 * Node image gallery — backed by Azure Blob Storage via the backend's
 * /api/projects/:pid/assets endpoint.
 *
 * Pulls every asset attached to the current project, then renders the
 * subset linked to this node OR to a purchase under this node. Uploads
 * go straight through the backend (multipart) so the file lives in
 * Blob Storage and is visible from every device.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { compressImage } from '@/lib/image'
import { pushToast } from '@/lib/toast'
import { type AssetSummary, deleteAsset, listAssets, uploadAsset } from '@/lib/repository'
import { ApiError } from '@/lib/api'
import { ImageLightbox, type LightboxImage } from '@/components/ImageLightbox'
import { LazyImage } from '@/components/LazyImage'
import type { DecorNode } from '@/types'

interface Props {
  node: DecorNode
}

interface DisplayAsset {
  asset: AssetSummary
  caption: string
  removable: boolean
}

export function NodeImagesPanel({ node }: Props) {
  const [assets, setAssets] = useState<AssetSummary[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshNonce = useRef(0)

  const purchases =
    useLiveQuery(() => db.purchases.where('nodeId').equals(node.id).toArray(), [node.id]) ?? []
  const purchaseIds = useMemo(() => new Set(purchases.map((p) => p.id)), [purchases])
  const purchaseNames = useMemo(() => new Map(purchases.map((p) => [p.id, p.name])), [purchases])

  const refresh = useCallback(async () => {
    const myNonce = ++refreshNonce.current
    try {
      const rows = await listAssets(node.projectId)
      if (myNonce === refreshNonce.current) {
        setAssets(rows)
        setError(null)
      }
    } catch (e) {
      if (myNonce !== refreshNonce.current) return
      if (e instanceof ApiError && e.status === 503) {
        // Storage not configured (local dev without Azure) — surface a
        // helpful message instead of an opaque error.
        setError('对象存储未配置：本地开发环境不支持图片上传，部署到 Azure 后自动可用')
      } else {
        setError((e as Error)?.message ?? '加载图片失败')
      }
      setAssets([])
    }
  }, [node.projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const display: DisplayAsset[] = useMemo(() => {
    if (!assets) return []
    const out: DisplayAsset[] = []
    for (const a of assets) {
      if (a.refType === 'node' && a.refId === node.id) {
        out.push({ asset: a, caption: '节点照片', removable: true })
      } else if (a.refType === 'purchase' && purchaseIds.has(a.refId)) {
        out.push({
          asset: a,
          caption: `采购：${purchaseNames.get(a.refId) ?? '—'}`,
          removable: false,
        })
      }
    }
    return out
  }, [assets, node.id, purchaseIds, purchaseNames])

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const lightboxImages: LightboxImage[] = useMemo(
    () =>
      display.map((d) => ({
        id: d.asset.id,
        src: d.asset.contentUrl,
        alt: d.asset.fileName,
        caption: d.caption,
      })),
    [display],
  )

  async function onAdd(fl: FileList | null) {
    if (!fl || fl.length === 0) return
    setBusy(true)
    try {
      for (const f of Array.from(fl)) {
        if (!f.type.startsWith('image/')) continue
        const compressed = await compressImage(f)
        await uploadAsset(node.projectId, 'node', node.id, compressed)
      }
      await refresh()
      pushToast('已上传', 'success', 1800)
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message || `上传失败 (${e.status})`
          : ((e as Error)?.message ?? '上传失败')
      pushToast(msg, 'error', 6000)
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(id: string) {
    setBusy(true)
    try {
      await deleteAsset(id)
      await refresh()
    } catch (e) {
      pushToast((e as Error)?.message ?? '删除失败', 'error', 6000)
    } finally {
      setBusy(false)
    }
  }

  if (assets === null) {
    return <div className="empty">加载中…</div>
  }

  return (
    <div>
      <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-soft)' }}>
        节点现场照、参考图、施工对比图 + 该节点下采购的图片，共 {display.length} 张
      </div>
      {error && (
        <div className="empty" style={{ fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      <div className="node-image-grid" data-testid="node-image-grid">
        {display.map((d, i) => (
          <div key={d.asset.id} className="image-thumb">
            <LazyImage
              src={d.asset.contentUrl}
              alt={d.asset.fileName}
              onClick={() => setLightboxIndex(i)}
              data-testid="image-thumb-img"
            />
            {d.removable && (
              <button
                className="remove"
                onClick={(e) => {
                  e.stopPropagation()
                  void onRemove(d.asset.id)
                }}
                aria-label="移除图片"
                disabled={busy}
              >
                ✕
              </button>
            )}
            {!d.removable && (
              <span
                title={d.caption}
                style={{
                  position: 'absolute',
                  left: 4,
                  top: 4,
                  background: 'rgba(0,0,0,0.55)',
                  color: '#fff',
                  fontSize: 10,
                  borderRadius: 4,
                  padding: '1px 5px',
                }}
              >
                采购
              </span>
            )}
          </div>
        ))}
        <label className="image-add" title="从相册添加图片" aria-disabled={busy}>
          {busy ? '上传中…' : '🖼 相册'}
          <input
            type="file"
            accept="image/*"
            multiple
            data-testid="node-image-input"
            style={{ display: 'none' }}
            disabled={busy}
            onChange={(e) => {
              void onAdd(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        {/* Mobile-only "shoot straight from the back camera" entry — on
            iOS Safari `capture="environment"` opens the camera app
            directly, which the issue's owner needs for on-site purchase
            records. Desktop browsers ignore `capture` and fall back to
            the file picker, so it's safe to show always. */}
        <label className="image-add" title="拍照添加图片" aria-disabled={busy}>
          📷 拍照
          <input
            type="file"
            accept="image/*"
            capture="environment"
            data-testid="node-image-capture"
            style={{ display: 'none' }}
            disabled={busy}
            onChange={(e) => {
              void onAdd(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {lightboxIndex != null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          index={Math.min(lightboxIndex, lightboxImages.length - 1)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
