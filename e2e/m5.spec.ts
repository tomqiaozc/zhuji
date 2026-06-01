import { test, expect } from '@playwright/test'
import { freshSession, loginExistingUser, registerNewUser, uniqueUsername } from './helpers'

/**
 * M5 golden path:
 *
 *   register → load demo → record a purchase → log out → log back in →
 *   data still there (i.e. it survived a cache reset because the cloud
 *   is the source of truth).
 *
 * Requires the backend to be reachable at the proxy target configured
 * in vite.config.ts (defaults to http://localhost:8000).
 */

test.beforeEach(async ({ page }) => {
  await freshSession(page)
})

test('register → load demo → record purchase → logout → login again, data still there', async ({
  page,
}) => {
  const username = uniqueUsername()

  // 1. Register from the auth page → backend creates the account → app
  //    renders empty-hero because there are no projects yet.
  await registerNewUser(page, username)

  // 2. Load the demo project. The backend seeds 11 stages / 62 nodes /
  //    ~30 purchases / ¥60-80k for this user.
  await page.getByTestId('empty-hero-demo').click()

  // Project switcher reflects the seeded project.
  await expect(page.getByText('示范家 · 89㎡', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  })

  // Dashboard cumulative-spend metric falls inside the spec window.
  await page.getByRole('button', { name: /总览/ }).first().click()
  await expect(page.locator('.metric .num').first()).not.toHaveText(/¥\s*0\b/, {
    timeout: 15_000,
  })
  const totalText = await page.locator('.metric .num').first().textContent()
  const total = Number((totalText ?? '').replace(/[^0-9.-]/g, ''))
  expect(total).toBeGreaterThanOrEqual(60_000)
  expect(total).toBeLessThanOrEqual(80_000)

  // 3. Record a new purchase. We pick the first node in NodeWorkspace
  //    so we don't depend on the seed's specific structure.
  await page.getByRole('button', { name: /节点工作台/ }).click()
  await page.locator('.node-link').first().click()
  await page.locator('button.tab', { hasText: '采购' }).dispatchEvent('click')
  await page.getByRole('button', { name: '+ 加一笔' }).click()
  const uniqueName = `E2E 测试采购 ${Date.now()}`
  await page.getByTestId('purchase-name').fill(uniqueName)
  await page.getByTestId('purchase-unit-price').fill('1234')
  await page.getByTestId('purchase-quantity').fill('1')
  await page.getByTestId('purchase-save').click()
  // Wait for the drawer to close → the purchase appears in the table.
  await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })

  // 4. Log out via the Topbar.
  await page.getByTestId('topbar-logout').click()
  // Auth page should reappear.
  await expect(page.getByTestId('auth-submit')).toBeVisible({ timeout: 10_000 })

  // 5. Log back in with the same credentials. The cloud-backed cache
  //    should rehydrate with everything we wrote.
  await loginExistingUser(page, username)

  // Project still there.
  await expect(page.getByText('示范家 · 89㎡', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  })

  // The custom purchase survives the round-trip — that's the cloud
  // persistence guarantee the M5 spec is asking for.
  await page.getByRole('button', { name: /节点工作台/ }).click()
  await page.locator('.node-link').first().click()
  await page.locator('button.tab', { hasText: '采购' }).dispatchEvent('click')
  await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 15_000 })
})

test('register validates min 8-char password', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '去注册' }).click()
  await page.getByTestId('auth-username').fill(uniqueUsername('short'))
  await page.getByTestId('auth-password').fill('short')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toContainText('8')
})

test('wrong password is rejected', async ({ page }) => {
  const username = uniqueUsername('wrong')
  await registerNewUser(page, username)
  // log out
  await page.getByTestId('topbar-logout').click()
  await expect(page.getByTestId('auth-submit')).toBeVisible()
  // try login with wrong password
  await page.getByTestId('auth-username').fill(username)
  await page.getByTestId('auth-password').fill('totally-wrong-password')
  await page.getByTestId('auth-submit').click()
  await expect(page.getByTestId('auth-error')).toBeVisible()
})

/**
 * Regression for the project-creation perf bug: M5 originally fanned
 * out ~600 sequential HTTP requests per new project (62 nodes × ~9
 * checklist items each), which took ~5 minutes from the browser. The
 * fix replaces that with a single bulk init endpoint, so a fresh
 * project should now take well under 5 seconds even with the entire
 * 62-node template — we assert < 10s here to leave headroom for
 * CI / slow sandboxes but still catch a regression to the old loop.
 */
test('create new project completes in well under 10 seconds (perf regression guard)', async ({
  page,
}) => {
  const username = uniqueUsername('perf')
  await registerNewUser(page, username)

  // Open the create modal from the empty-hero affordance.
  await page.getByTestId('empty-hero-create').click()
  await page.getByTestId('project-name').fill('性能测试项目')

  const start = Date.now()
  await page.getByTestId('project-create-submit').click()

  // Topbar reflects the new project once the cache has caught up. This
  // covers backend create + init-from-template + hydrate.
  await expect(page.getByText('性能测试项目', { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  })
  const elapsed = Date.now() - start
  expect(elapsed).toBeLessThan(10_000)

  // Node tree shows 62 nodes (one per active template entry).
  await page.getByRole('button', { name: /节点工作台/ }).click()
  await expect(page.locator('.node-link')).toHaveCount(62, { timeout: 15_000 })
})
test('CR2: cross-account switch does not leak A’s currentProjectId to B', async ({ page }) => {
  const alice = uniqueUsername('alice')
  const bob = uniqueUsername('bob')

  // A registers, loads demo, lands on Dashboard.
  await registerNewUser(page, alice)
  await page.getByTestId('empty-hero-demo').click()
  await expect(page.getByText('示范家 · 89㎡', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  })

  // A logs out.
  await page.getByTestId('topbar-logout').click()
  await expect(page.getByTestId('auth-submit')).toBeVisible({ timeout: 10_000 })

  // B registers immediately on the same browser. Without the fix, the
  // persisted currentProjectId (= A's project) would pin B's main view
  // to a non-existent row and the EmptyHero would never appear.
  await page.getByRole('button', { name: '去注册' }).click()
  await page.getByTestId('auth-username').fill(bob)
  await page.getByTestId('auth-password').fill('secret-test-1234')
  await page.getByTestId('auth-submit').click()

  // B is a brand-new account, so they should see EmptyHero — not a
  // permanent loading spinner pointing at A's project.
  await expect(page.getByTestId('empty-hero')).toBeVisible({ timeout: 15_000 })
  // And the Topbar reflects B, not A.
  await expect(page.getByTestId('topbar-user')).toContainText(bob)
})
