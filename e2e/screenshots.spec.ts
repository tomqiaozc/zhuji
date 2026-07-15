import { test, expect } from '@playwright/test'
import { freshSession, registerNewUser, uniqueUsername } from './helpers'

const OUT = 'docs/screenshots'

// One-off capture run: register a clean account, load the bundled demo
// project, then screenshot each main view for the README. Not part of the
// regular suite's assertions — it just produces images.
test('capture README screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await freshSession(page)
  await registerNewUser(page, uniqueUsername('shots'))

  // Load the demo dataset so views aren't empty.
  await page.getByTestId('empty-hero-demo').click()
  // Dashboard renders once the demo project is active.
  await expect(page.getByRole('heading', { name: '总览' }).first()).toBeVisible({ timeout: 20_000 })
  // Let the "已加载" toast auto-dismiss so it doesn't overlap the charts.
  await expect(page.getByText(/已加载「/)).toBeHidden({ timeout: 10_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: false })

  // Node workspace
  await page.getByRole('button', { name: /节点工作台/ }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/nodes.png`, fullPage: false })

  // Timeline (Gantt)
  await page.getByRole('button', { name: /时间轴/ }).click()
  await expect(page.getByRole('heading', { name: '时间轴' })).toBeVisible()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/gantt.png`, fullPage: false })

  // Purchases
  await page.getByRole('button', { name: /采购流水/ }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/purchases.png`, fullPage: false })
})
