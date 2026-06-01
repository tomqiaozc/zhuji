import { Page } from '@playwright/test'

/**
 * Clear localStorage + IndexedDB before the React tree mounts.
 *
 * Auth state, persisted Zustand stores, and the Dexie cache all need
 * to be empty so each test starts from "fresh install".
 */
export async function freshSession(page: Page) {
  await page.addInitScript(() => {
    try {
      if (window.localStorage.getItem('__zhuji_e2e_wiped__') === '1') return
      window.localStorage.clear()
      window.sessionStorage.clear()
      indexedDB.deleteDatabase('zhuji-db')
      window.localStorage.setItem('__zhuji_e2e_wiped__', '1')
      // Suppress the NodeWorkspace first-run overlay so it doesn't
      // intercept clicks.
      window.localStorage.setItem('zhuji-onboarded-node-workspace-v1', '1')
    } catch {}
  })
}

/** Click the visible auth form's register button and wait until the app loads. */
export async function registerNewUser(page: Page, username: string) {
  await page.goto('/')
  // The form defaults to "login"; click "去注册" to switch to register mode.
  await page.getByRole('button', { name: '去注册' }).click()
  await page.getByTestId('auth-username').fill(username)
  await page.getByTestId('auth-password').fill('secret-test-1234')
  await page.getByTestId('auth-submit').click()
  // EmptyHero shows up once the project list (empty) loads.
  await page.getByTestId('empty-hero').waitFor({ timeout: 15_000 })
}

/** Log in as an existing user (assumes account already registered). */
export async function loginExistingUser(page: Page, username: string) {
  await page.goto('/')
  await page.getByTestId('auth-username').fill(username)
  await page.getByTestId('auth-password').fill('secret-test-1234')
  await page.getByTestId('auth-submit').click()
}

export function uniqueUsername(prefix = 'e2e'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
