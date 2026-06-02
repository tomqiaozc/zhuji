/**
 * Backend API client.
 *
 * - Reads JWT from the auth store; injects `Authorization: Bearer ...`.
 * - On 401, clears the auth store (forces re-login).
 * - All bodies are JSON. Throws ApiError with the server's detail string
 *   on non-2xx, so callers can `try/catch` and surface a message.
 */

const RAW_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
// Normalize: drop trailing slash; strip the trailing /api so endpoints below
// can hard-code their own `/api/...` paths (matches the backend's OpenAPI).
const BASE = (() => {
  let b = RAW_BASE.replace(/\/+$/, '')
  if (b.endsWith('/api')) b = b.slice(0, -4)
  return b
})()

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.status = status
    this.body = body
  }
}

let getToken: () => string | null = () => null
let onUnauthorized: () => void = () => {}

export function configureApi(opts: { getToken: () => string | null; onUnauthorized: () => void }) {
  getToken = opts.getToken
  onUnauthorized = opts.onUnauthorized
}

/**
 * Build an absolute URL for an endpoint that can't carry an
 * Authorization header — e.g. ``<img src>``. Appends the cached
 * short-TTL asset-viewer token as ``?token=...``.
 *
 * Returns an empty string if no viewer token has been minted yet —
 * callers should ``await ensureAssetViewerToken()`` first (the asset
 * gallery does this before rendering). The main API JWT is NEVER
 * embedded here: it must not appear in URLs (browser history, server
 * logs, Referer).
 */
export function authedUrl(path: string): string {
  const token = currentAssetViewerToken()
  if (!token) return ''
  const sep = path.includes('?') ? '&' : '?'
  return `${BASE}${path}${sep}token=${encodeURIComponent(token)}`
}

interface AssetViewerCache {
  token: string
  /** ms-since-epoch; we refresh ~60s before this. */
  expiresAt: number
}

let assetViewerCache: AssetViewerCache | null = null
let assetViewerInflight: Promise<string> | null = null

// Refresh a minute before the server-side TTL so an image that loads
// right at the edge still gets a fresh token instead of a 401.
const VIEWER_REFRESH_MARGIN_MS = 60_000

function currentAssetViewerToken(): string | null {
  if (!assetViewerCache) return null
  if (Date.now() + VIEWER_REFRESH_MARGIN_MS >= assetViewerCache.expiresAt) return null
  return assetViewerCache.token
}

interface AssetViewerTokenResponse {
  token: string
  expires_in: number
}

/**
 * Make sure an unexpired asset-viewer token is cached, minting one if
 * needed. Safe to call concurrently — concurrent requests share a
 * single mint round-trip. Returns the cached token.
 *
 * Requires the user to be logged in (main JWT in the auth store).
 */
export async function ensureAssetViewerToken(): Promise<string> {
  const fresh = currentAssetViewerToken()
  if (fresh) return fresh
  if (assetViewerInflight) return assetViewerInflight
  assetViewerInflight = (async () => {
    const out = await request<AssetViewerTokenResponse>('POST', '/api/auth/asset-viewer-token')
    assetViewerCache = {
      token: out.token,
      expiresAt: Date.now() + out.expires_in * 1000,
    }
    return out.token
  })()
  try {
    return await assetViewerInflight
  } finally {
    assetViewerInflight = null
  }
}

/** Clear the cached viewer token (e.g. on logout). */
export function clearAssetViewerToken(): void {
  assetViewerCache = null
  assetViewerInflight = null
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  })

  if (res.status === 401) {
    onUnauthorized()
  }

  if (res.status === 204) return undefined as unknown as T

  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    const detail =
      (parsed && typeof parsed === 'object' && 'detail' in parsed
        ? String((parsed as { detail: unknown }).detail)
        : '') ||
      (typeof parsed === 'string' ? parsed : '') ||
      `HTTP ${res.status}`
    throw new ApiError(res.status, detail, parsed)
  }
  return parsed as T
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, body?: unknown) => request<T>('POST', p, body),
  patch: <T>(p: string, body?: unknown) => request<T>('PATCH', p, body),
  delete: <T = void>(p: string) => request<T>('DELETE', p),
  /** Multipart upload — lets `fetch` set the Content-Type with the
   *  generated MIME boundary. Token + 401 handling still apply. */
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers,
      body: form,
    })
    if (res.status === 401) onUnauthorized()
    if (res.status === 204) return undefined as unknown as T
    const text = await res.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }
    if (!res.ok) {
      const detail =
        (parsed && typeof parsed === 'object' && 'detail' in parsed
          ? String((parsed as { detail: unknown }).detail)
          : '') ||
        (typeof parsed === 'string' ? parsed : '') ||
        `HTTP ${res.status}`
      throw new ApiError(res.status, detail, parsed)
    }
    return parsed as T
  },
}
