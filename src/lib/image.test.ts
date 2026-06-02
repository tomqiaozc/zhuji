import { describe, expect, it, vi } from 'vitest'
import { compressImage } from './image'

describe('compressImage', () => {
  it('returns the original file when MIME is not an image', async () => {
    const f = new File(['hello'], 'a.txt', { type: 'text/plain' })
    const out = await compressImage(f)
    expect(out).toBe(f)
  })

  it('skips formats we deliberately do not recompress (gif/svg/heic/heif)', async () => {
    for (const type of ['image/gif', 'image/svg+xml', 'image/heic', 'image/heif']) {
      const f = new File(['x'], 'a.bin', { type })
      const out = await compressImage(f)
      expect(out).toBe(f)
    }
  })

  it('returns the original file if createImageBitmap throws (browser cannot decode)', async () => {
    const fake = vi.fn().mockRejectedValue(new Error('decode'))
    const original = (globalThis as { createImageBitmap?: unknown }).createImageBitmap
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      writable: true,
      value: fake,
    })
    try {
      const f = new File(['jpeg-bytes'], 'a.jpg', { type: 'image/jpeg' })
      const out = await compressImage(f)
      expect(out).toBe(f)
      expect(fake).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(globalThis, 'createImageBitmap', {
        configurable: true,
        writable: true,
        value: original,
      })
    }
  })

  it('returns the original small JPEG without re-encoding when it is already under the budget', async () => {
    // Stub createImageBitmap so we return a 100x80 image with the
    // original "byte length" small enough to skip the recompress path.
    const bitmap = {
      width: 100,
      height: 80,
      close: vi.fn(),
    }
    const fakeBitmap = vi.fn().mockResolvedValue(bitmap as unknown as ImageBitmap)
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      writable: true,
      value: fakeBitmap,
    })
    try {
      const f = new File([new Uint8Array(1024)], 'tiny.jpg', {
        type: 'image/jpeg',
      })
      const out = await compressImage(f)
      expect(out).toBe(f)
      expect(bitmap.close).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(globalThis, 'createImageBitmap', {
        configurable: true,
        writable: true,
        value: undefined,
      })
    }
  })
})
