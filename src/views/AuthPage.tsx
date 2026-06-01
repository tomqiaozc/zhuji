/**
 * Login / Register screen — username + password, ≥8 chars on register.
 *
 * On success: hydrate the local cache from the backend, then call
 * `onAuthed()` to let the app render its main UI.
 */

import { useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { useApp } from '@/store/app'
import { useAuth, type AuthUser } from '@/store/auth'
import { clearLocalCache, hydrateEverything } from '@/lib/repository'

interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  user: AuthUser
}

interface Props {
  onAuthed: () => void
}

type Mode = 'login' | 'register'

export function AuthPage({ onAuthed }: Props) {
  const setSession = useAuth((s) => s.setSession)
  const resetApp = useApp((s) => s.reset)
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function clientValidate(): string | null {
    if (username.trim().length < 3) return '用户名至少 3 位'
    if (/\s/.test(username)) return '用户名不能含空格'
    if (mode === 'register' && password.length < 8) return '密码至少 8 位'
    if (password.length === 0) return '请输入密码'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const localErr = clientValidate()
    if (localErr) {
      setError(localErr)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const res = await api.post<TokenResponse>(path, {
        username: username.trim(),
        password,
      })
      // Clear any leftover cache + UI state from a previous session
      // before fetching the new user's data — never let one account see
      // another's projects or land on its persisted currentProjectId.
      await clearLocalCache()
      resetApp()
      setSession(res.access_token, res.user)
      try {
        await hydrateEverything()
      } catch (hydrateErr) {
        // Login itself succeeded; only the data pull failed. The app will
        // render and the user can retry from the UI.
        console.warn('hydrate failed after login', hydrateErr)
      }
      onAuthed()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || `请求失败 (${err.status})`)
      } else {
        setError((err as Error)?.message ?? '网络错误')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <h1>筑迹 · Zhuji</h1>
          <p className="auth-sub">{mode === 'login' ? '登录' : '注册新账号'}</p>
        </div>

        <label className="auth-field">
          <span>用户名</span>
          <input
            data-testid="auth-username"
            type="text"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            required
          />
        </label>

        <label className="auth-field">
          <span>密码{mode === 'register' && <em className="auth-hint"> ≥ 8 位</em>}</span>
          <input
            data-testid="auth-password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            required
          />
        </label>

        {error && (
          <div data-testid="auth-error" className="auth-error">
            {error}
          </div>
        )}

        <button
          data-testid="auth-submit"
          type="submit"
          className="auth-submit"
          disabled={busy}
        >
          {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
        </button>

        <div className="auth-toggle">
          {mode === 'login' ? (
            <>
              还没账号？
              <button type="button" onClick={() => setMode('register')} disabled={busy}>
                去注册
              </button>
            </>
          ) : (
            <>
              已有账号？
              <button type="button" onClick={() => setMode('login')} disabled={busy}>
                去登录
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
