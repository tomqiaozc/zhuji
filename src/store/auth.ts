/**
 * Auth state — JWT + current user, persisted to localStorage so the user
 * stays logged in across reloads.
 *
 * Wired up to the API client in src/main.tsx: a 401 from the backend
 * clears this store, which sends the app back to the login page.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: string
  username: string
  created_at: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  setSession: (token: string, user: AuthUser) => void
  clearSession: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
    }),
    {
      name: 'zhuji-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
)
