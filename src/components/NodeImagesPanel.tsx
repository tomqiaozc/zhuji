/**
 * Image gallery — deferred to M6 (server-side Blob Storage).
 *
 * In M5 the data layer became cloud-backed, but image uploads still need
 * a backend blob endpoint. Rather than silently writing IndexedDB-only
 * blobs (which would only appear on the device that uploaded them), this
 * panel now renders a friendly placeholder. The full gallery lands in M6.
 */

import type { DecorNode } from '@/types'

interface Props {
  node: DecorNode
}

export function NodeImagesPanel({ node }: Props) {
  // We still take the node prop so call sites don't need to change.
  void node
  return (
    <div className="empty" style={{ padding: '24px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, marginBottom: 6 }}>📷 节点照片功能即将在 M6 上线</div>
      <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>
        云端化后会接 Blob Storage 统一存储，多设备都能看到。
      </div>
    </div>
  )
}
