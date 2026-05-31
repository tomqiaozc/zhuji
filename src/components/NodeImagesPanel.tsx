import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { uid } from '@/lib/uid'
import { deleteAsset } from '@/lib/cascade'
import type { Asset, DecorNode } from '@/types'

interface Props {
  node: DecorNode
}

export function NodeImagesPanel({ node }: Props) {
  const images =
    useLiveQuery(
      () => db.assets.where('[refType+refId]').equals(['node', node.id]).toArray(),
      [node.id],
    ) ?? []

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
      const asset: Asset = {
        id: uid('ast'),
        projectId: node.projectId,
        refType: 'node',
        refId: node.id,
        fileName: f.name,
        mimeType: f.type,
        blob: f,
        size: f.size,
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

  return (
    <div>
      <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-soft)' }}>
        节点现场照、参考图、施工对比图等
      </div>
      <div className="node-image-grid" data-testid="node-image-grid">
        {images.map((a) => (
          <div key={a.id} className="image-thumb">
            <img src={urlFor(a)} alt={a.fileName} />
            <button className="remove" onClick={() => void onRemove(a.id)} aria-label="移除图片">
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
            data-testid="node-image-input"
            style={{ display: 'none' }}
            onChange={(e) => {
              void onAdd(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
    </div>
  )
}
