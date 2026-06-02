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

  // Count /api/ requests that fire AFTER the submit click. The old
  // path issued ~600 (62 nodes × ~9 checklist items, each a serial
  // POST, plus 62 GETs to rehydrate). The bulk init + snapshot path
  // should be 3 calls: POST projects, POST init-from-template, GET
  // snapshot. We allow up to 10 to leave room for the topbar
  // refresh + an extra retry, but anything close to 60 means a
  // regression.
  const apiRequests: string[] = []
  let countRequests = false
  page.on('request', (req) => {
    if (!countRequests) return
    const u = req.url()
    const idx = u.indexOf('/api/')
    if (idx >= 0) apiRequests.push(u.slice(idx))
  })

  const start = Date.now()
  countRequests = true
  await page.getByTestId('project-create-submit').click()

  // Topbar reflects the new project once the cache has caught up. This
  // covers backend create + init-from-template + snapshot hydrate.
  await expect(page.getByText('性能测试项目', { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  })
  const elapsed = Date.now() - start

  // Node tree shows 62 nodes (one per active template entry).
  await page.getByRole('button', { name: /节点工作台/ }).click()
  await expect(page.locator('.node-link')).toHaveCount(62, { timeout: 15_000 })

  // Stop counting before any unrelated background traffic kicks in.
  countRequests = false

  expect(elapsed).toBeLessThan(10_000)

  // Hard ceiling: < 10 total /api/ calls. Anything approaching 60 would
  // mean the per-node hydration crept back in.
  expect(apiRequests.length, `Too many /api/ requests:\n${apiRequests.join('\n')}`).toBeLessThan(10)

  // Belt-and-braces: explicitly forbid the per-node checklist GET that
  // used to dominate hydration time. A single match would mean the
  // snapshot endpoint isn't being used.
  const perNodeChecklistCalls = apiRequests.filter((u) =>
    /\/api\/nodes\/[^/]+\/checklist(\?|$)/.test(u),
  )
  expect(perNodeChecklistCalls, perNodeChecklistCalls.join('\n')).toEqual([])
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

test('RichTextEditor restores existing notes on remount and debounces commits', async ({
  page,
}) => {
  // Regression for code-review feedback: the editor's initial mount
  // must seed the contentEditable div with `value`, otherwise switching
  // to a node with existing notes shows a blank editor and a stray
  // blur would clobber the saved content. Also asserts the debounce —
  // typing N characters should not result in N PATCH requests.
  const username = uniqueUsername()
  await registerNewUser(page, username)
  await page.getByTestId('empty-hero-demo').click()
  await expect(page.getByText('示范家 · 89㎡', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  })
  await page.getByRole('button', { name: /节点工作台/ }).click()
  await page.locator('.node-link').first().click()
  await page.locator('button.tab', { hasText: '备注' }).dispatchEvent('click')

  // The seed data populates this node with a non-empty note. The bug
  // we're guarding against would render the editor blank on first
  // mount; this assertion fails immediately under the regression.
  const editor = page.locator('.rt-editor')
  await expect(editor).not.toBeEmpty({ timeout: 10_000 })
  const initialText = (await editor.textContent()) ?? ''
  expect(initialText.length).toBeGreaterThan(0)

  // Type some extra content + blur via tab switch — the new content
  // must be appended to (not replace) the seeded note, AND the seeded
  // note must still be there when we remount the tab.
  const suffix = '附加备注XYZ'
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.type(suffix)
  await page.locator('button.tab', { hasText: '避坑清单' }).click()
  await page.locator('button.tab', { hasText: '备注' }).click()
  await expect(editor).toContainText(initialText, { timeout: 5_000 })
  await expect(editor).toContainText(suffix, { timeout: 5_000 })

  // Switch to a different node and back — the seeded + appended content
  // must reappear (this is the path that broke under the original ref
  // initialisation; the second mount used to render empty).
  await page.locator('.node-link').nth(1).click()
  await page.locator('button.tab', { hasText: '备注' }).click()
  await page.locator('.node-link').first().click()
  await page.locator('button.tab', { hasText: '备注' }).click()
  await expect(editor).toContainText(initialText, { timeout: 5_000 })
  await expect(editor).toContainText(suffix, { timeout: 5_000 })

  // Debounce check: count PATCH /api/nodes/:id requests while typing
  // 12 characters quickly. Without debounce that would be 12; with the
  // 300ms debounce + onBlur commit it should be at most 2 (the trailing
  // debounce + the blur).
  const patches: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && /\/api\/nodes\/[^/]+$/.test(req.url())) {
      patches.push(req.url())
    }
  })
  await editor.click()
  await page.keyboard.press('End')
  await page.keyboard.type('abcdefghijkl', { delay: 20 })
  await page.locator('button.tab', { hasText: '避坑清单' }).click()
  await page.waitForTimeout(500)
  expect(patches.length, `expected ≤ 2 PATCHes, got ${patches.length}`).toBeLessThanOrEqual(2)
})
