import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { uid } from '@/lib/uid'
import { deleteAsset } from '@/lib/cascade'
import { compressImage } from '@/lib/image'
import { ImageLightbox, type LightboxImage } from '@/components/ImageLightbox'
import { LazyImage } from '@/components/LazyImage'
import type { Asset, DecorNode } from '@/types'

interface Props {
  node: DecorNode
}

interface DisplayAsset {
  asset: Asset
  caption: string
  removable: boolean
}

export function NodeImagesPanel({ node }: Props) {
  const nodeImages =
    useLiveQuery(
      () => db.assets.where('[refType+refId]').equals(['node', node.id]).toArray(),
      [node.id],
    ) ?? []

  // Also pull purchase images for purchases attached to this node.
  const purchases =
    useLiveQuery(() => db.purchases.where('nodeId').equals(node.id).toArray(), [node.id]) ?? []
  const purchaseIds = useMemo(() => purchases.map((p) => p.id), [purchases])
  const purchaseImages =
    useLiveQuery(async () => {
      if (purchaseIds.length === 0) return [] as Asset[]
      const all = await db.assets.where('refType').equals('purchase').toArray()
      const set = new Set(purchaseIds)
      return all.filter((a) => set.has(a.refId))
    }, [purchaseIds]) ?? []

  const display: DisplayAsset[] = useMemo(() => {
    const ofPurchase = new Map(purchases.map((p) => [p.id, p.name]))
    const nodeList: DisplayAsset[] = nodeImages.map((a) => ({
      asset: a,
      caption: '节点照片',
      removable: true,
    }))
    const purList: DisplayAsset[] = purchaseImages.map((a) => ({
      asset: a,
      caption: `采购：${ofPurchase.get(a.refId) ?? '—'}`,
      removable: false,
    }))
    return [...nodeList, ...purList]
  }, [nodeImages, purchaseImages, purchases])

  const blobUrlsRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current.values()) URL.revokeObjectURL(url)
      blobUrlsRef.current.clear()
    }
  }, [])

  function urlFor(a: Asset): string {
    const cached = blobUrlsRef.current.get(a.id)
    if (cached) return cached
    const url = URL.createObjectURL(a.blob)
    blobUrlsRef.current.set(a.id, url)
    return url
  }

  async function onAdd(fl: FileList | null) {
    if (!fl) return
    for (const f of Array.from(fl)) {
      if (!f.type.startsWith('image/')) continue
      const compressed = await compressImage(f)
      const asset: Asset = {
        id: uid('ast'),
        projectId: node.projectId,
        refType: 'node',
        refId: node.id,
        fileName: compressed.name,
        mimeType: compressed.type,
        blob: compressed,
        size: compressed.size,
        createdAt: new Date().toISOString(),
      }
      await db.assets.add(asset)
    }
  }

  async function onRemove(id: string) {
    const url = blobUrlsRef.current.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      blobUrlsRef.current.delete(id)
    }
    await deleteAsset(id)
  }

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const lightboxImages: LightboxImage[] = useMemo(
    () =>
      display.map((d) => ({
        id: d.asset.id,
        src: urlFor(d.asset),
        alt: d.asset.fileName,
        caption: d.caption,
      })),
    // urlFor reads from a ref; safe to depend on display only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display],
  )

  return (
    <div>
      <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-soft)' }}>
        节点现场照、参考图、施工对比图 + 该节点下采购的图片，共 {display.length} 张
      </div>
      <div className="node-image-grid" data-testid="node-image-grid">
        {display.map((d, i) => (
          <div key={d.asset.id} className="image-thumb">
            <LazyImage
              src={urlFor(d.asset)}
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
        <label className="image-add" title="添加图片">
          + 加图
          <input
            type="file"
            accept="image/*"
            multiple
            data-testid="node-image-input"
            style={{ display: 'none' }}
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
