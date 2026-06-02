import { test, expect } from '@playwright/test'
import { freshSession, registerNewUser, uniqueUsername } from './helpers'

/**
 * Mobile NodeWorkspace picker sheet: a11y and current-node-close behavior.
 *
 * These verify the two PR3 review asks:
 *   1. The sheet is a real dialog (uses the shared Modal primitive →
 *      focus-trap, body scroll lock, Esc-to-close, focus restore), and
 *      the trigger advertises aria-expanded + aria-controls.
 *   2. Tapping the already-active node closes the sheet (instead of
 *      looking unresponsive).
 */

test.use({ viewport: { width: 375, height: 812 } })

test.beforeEach(async ({ page }) => {
  await freshSession(page)
})

async function bootIntoNodeWorkspace(page: import('@playwright/test').Page) {
  const username = uniqueUsername()
  await registerNewUser(page, username)
  await page.getByTestId('empty-hero-demo').click()
  await expect(page.getByText('示范家 · 89㎡', { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  })
  // Mobile sidebar hidden by default — open via hamburger and pick 节点工作台.
  await page.getByRole('button', { name: '菜单' }).first().click()
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /节点工作台/ }).first().click()
  await page.waitForTimeout(500)
}

test('picker trigger advertises aria-expanded/controls and toggles', async ({ page }) => {
  await bootIntoNodeWorkspace(page)
  const trigger = page.getByRole('button', { name: '切换节点' })
  await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toHaveAttribute('aria-controls', 'node-picker-sheet')

  await trigger.click()
  await expect(page.getByTestId('node-picker-sheet')).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('node-picker-sheet')).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('tapping the currently-active node closes the sheet', async ({ page }) => {
  await bootIntoNodeWorkspace(page)
  await page.getByRole('button', { name: '切换节点' }).click()
  const sheet = page.getByTestId('node-picker-sheet')
  await expect(sheet).toBeVisible()

  // The current node is the first node from the seed (房屋验收) per the
  // app's auto-select behavior. Tap its node-link inside the sheet.
  const activeLink = sheet.locator('.node-link.active').first()
  await expect(activeLink).toBeVisible()
  await activeLink.click()

  await expect(sheet).toHaveCount(0)
})

test('Modal-driven sheet locks body scroll while open', async ({ page }) => {
  await bootIntoNodeWorkspace(page)
  const before = await page.evaluate(() => document.body.style.overflow)
  await page.getByRole('button', { name: '切换节点' }).click()
  await expect(page.getByTestId('node-picker-sheet')).toBeVisible()
  const during = await page.evaluate(() => document.body.style.overflow)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('node-picker-sheet')).toHaveCount(0)
  const after = await page.evaluate(() => document.body.style.overflow)
  expect(during).toBe('hidden')
  expect(after).toBe(before)
})
