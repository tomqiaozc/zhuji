import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthPage } from './views/AuthPage'
import { useApp } from './store/app'
import { useAuth } from './store/auth'
import { configureApi } from './lib/api'
import { clearLocalCache, hydrateEverything } from './lib/repository'
import './styles.css'

// Wire API client to auth store. Token is read on every request; a 401
// from the backend clears the session AND the UI store (so next user's
// boot doesn't reuse the previous user's currentProjectId) and bounces
// us back to AuthPage.
configureApi({
  getToken: () => useAuth.getState().token,
  onUnauthorized: () => {
    void clearLocalCache()
    useApp.getState().reset()
    useAuth.getState().clearSession()
  },
})

function Root() {
  const token = useAuth((s) => s.token)
  const [hydrating, setHydrating] = useState<boolean>(!!token)

  // App boot: if we already have a session, refresh the cache from the
  // server before showing the UI. Catches data that changed on another
  // device since the last session.
  useEffect(() => {
    let cancelled = false
    if (!token) {
      setHydrating(false)
      return
    }
    setHydrating(true)
    hydrateEverything()
      .catch((err) => {
        // 401 already handled by the API client; other errors we just
        // log — the user can still work against the cached snapshot.
        console.warn('boot hydrate failed', err)
      })
      .finally(() => {
        if (!cancelled) setHydrating(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (!token) {
    return (
      <AuthPage
        onAuthed={() => {
          /* token change triggers re-render */
        }}
      />
    )
  }
  if (hydrating) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ alignItems: 'center' }}>
          <p>正在同步云端数据…</p>
        </div>
      </div>
    )
  }
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
