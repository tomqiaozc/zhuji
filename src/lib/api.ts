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

export function configureApi(opts: {
  getToken: () => string | null
  onUnauthorized: () => void
}) {
  getToken = opts.getToken
  onUnauthorized = opts.onUnauthorized
}

/**
 * Build an absolute URL for an endpoint that can't carry an
 * Authorization header — e.g. ``<img src>``. Appends the current JWT
 * as ``?token=...``. Returns an empty string if the user isn't logged
 * in, which is a defensive guard for callers that forget to check.
 */
export function authedUrl(path: string): string {
  const token = getToken()
  if (!token) return ''
  const sep = path.includes('?') ? '&' : '?'
  return `${BASE}${path}${sep}token=${encodeURIComponent(token)}`
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
