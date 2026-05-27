import { Page, expect } from '@playwright/test'

/**
 * Clear IndexedDB + localStorage so each test starts from a known empty state.
 * Must be called BEFORE the app's React tree mounts (init script), otherwise
 * we race the auto-open project modal.
 */
export async function freshSession(page: Page) {
  await page.addInitScript(() => {
    try {
      // Sentinel ensures we wipe ONCE per test (cold start), not on every
      // navigation/reload — otherwise reload nukes the data we want to verify
      // survives reload.
      if (window.localStorage.getItem('__zhuji_e2e_wiped__') === '1') return
      window.localStorage.clear()
      window.sessionStorage.clear()
      indexedDB.deleteDatabase('zhuji-db')
      window.localStorage.setItem('__zhuji_e2e_wiped__', '1')
    } catch {}
  })
}

/**
 * Open the app, click "Load Demo Project" in the first-run modal.
 * Returns once Dashboard is visible with the demo project active.
 */
export async function loadDemo(page: Page) {
  await page.goto('/')
  await page.getByTestId('btn-load-demo-modal').click()
  await expect(page.getByText('示范家 · 89㎡', { exact: false }).first()).toBeVisible()
  await page.getByRole('button', { name: /总览/ }).first().click()
  await expect(page.getByText('累计支出')).toBeVisible()
  // Wait for Dashboard's useLiveQuery to actually return purchases — otherwise
  // tests that read `.metric .num` race against an empty initial render.
  await expect(page.locator('.metric .num').first()).not.toHaveText(/¥\s*0\b/, { timeout: 8000 })
}

export async function parseMoney(text: string): Promise<number> {
  return Number(text.replace(/[^0-9.-]/g, ''))
}
