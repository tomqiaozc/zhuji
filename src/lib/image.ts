// Downscale large images on upload so we don't bloat IndexedDB with 5MB phone
// photos. Long edge clamped to 1920px, encoded as JPEG q=0.85. PNGs with
// transparency, GIFs, SVGs, HEIC, and images already smaller than the cap fall
// through unchanged.

const MAX_EDGE = 1920
const QUALITY = 0.85
const SKIP_MIME = new Set(['image/gif', 'image/svg+xml', 'image/heic', 'image/heif'])

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (SKIP_MIME.has(file.type)) return file

  // For PNGs preserve transparency; only switch to JPEG when source is already
  // a lossy format.
  const reEncodeMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  const { width, height } = bitmap
  const longest = Math.max(width, height)

  // Don't waste work: if already within budget AND the original is reasonably
  // small, skip. Always recompress when source is > 600 KB.
  if (longest <= MAX_EDGE && file.size < 600 * 1024) {
    bitmap.close()
    return file
  }

  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, reEncodeMime, QUALITY))
  if (!blob) return file

  // If reencoding somehow grew the file, keep the original.
  if (blob.size >= file.size && longest <= MAX_EDGE) return file

  const ext = reEncodeMime === 'image/png' ? '.png' : '.jpg'
  const base = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], base + ext, { type: reEncodeMime, lastModified: Date.now() })
}
