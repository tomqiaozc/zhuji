import { expect, test } from '@playwright/test'
import { freshSession, registerNewUser, uniqueUsername } from './helpers'

/**
 * Coverage for the post-M3 retrospective improvements:
 *
 *   1. NodeWorkspace 采购编辑按钮
 *   2. NodeWorkspace 采购删除确认
 *   3. Dashboard nodeMap 优化 (verified indirectly — page still renders)
 *   4. 预算追踪
 *   5. 自定义采购品类
 *   6. 删除 undo toast
 */

test.beforeEach(async ({ page }) => {
  await freshSession(page)
  // Stub window.confirm so the confirmDialog component can fall back if
  // anything bypasses our custom dialog (it shouldn't, but belt-and-braces).
  await page.addInitScript(() => {
    window.confirm = () => true
  })
})

async function gotoDemo(page: import('@playwright/test').Page) {
  const username = uniqueUsername()
  await registerNewUser(page, username)
  await page.getByTestId('empty-hero-demo').click()
  await expect(page.getByText('示范家 · 89㎡', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  })
  // The 30 demo purchases hydrate asynchronously after the project switch.
  // Block until the Dashboard's cumulative-spend metric is non-zero so the
  // downstream tests don't race against an unloaded NodeWorkspace.
  await page.getByRole('button', { name: /总览/ }).first().click()
  await expect(page.locator('.metric .num').first()).not.toHaveText(/¥\s*0\b/, {
    timeout: 20_000,
  })
}

/**
 * Pick the first node in the active stage filter that has at least one
 * purchase by reading the global Purchases ledger and returning the
 * combined "<stage> / <node>" label from the first row.
 */
async function firstNodeWithPurchases(
  page: import('@playwright/test').Page,
): Promise<{ stage: string; node: string }> {
  await page.getByRole('button', { name: /采购流水/ }).first().click()
  await expect(page.locator('.purchase-table tbody tr').first()).toBeVisible({ timeout: 15_000 })
  const cell = await page
    .locator('.purchase-table tbody tr')
    .first()
    .locator('td')
    .nth(1)
    .textContent()
  const [stage, node] = (cell ?? '').split(' / ').map((s) => s.trim())
  expect(stage, 'expected stage in second column of purchase table').toBeTruthy()
  expect(node, 'expected node in second column of purchase table').toBeTruthy()
  return { stage, node }
}

async function openNodeInWorkspace(
  page: import('@playwright/test').Page,
  nodeName: string,
): Promise<void> {
  await page.getByRole('button', { name: /节点工作台/ }).click()
  // Stage headers may have collapsed the target node; clicking the node
  // link directly is enough once the tree finishes rendering.
  const link = page.locator('.node-link', { hasText: nodeName }).first()
  await expect(link).toBeVisible({ timeout: 10_000 })
  await link.click()
  await page.locator('button.tab', { hasText: '采购' }).dispatchEvent('click')
}

test('NodeWorkspace purchase row has an edit button that opens the drawer in edit mode', async ({
  page,
}) => {
  await gotoDemo(page)
  const { node } = await firstNodeWithPurchases(page)
  await openNodeInWorkspace(page, node)

  const editBtn = page.locator('[data-testid^="node-purchase-edit-"]').first()
  await expect(editBtn).toBeVisible({ timeout: 10_000 })
  await editBtn.click()
  await expect(page.getByText('编辑采购')).toBeVisible({ timeout: 5_000 })
  const nameInput = page.getByTestId('purchase-name')
  const v = await nameInput.inputValue()
  expect(v.length).toBeGreaterThan(0)
  await nameInput.fill(`${v} (已编辑)`)
  await page.getByTestId('purchase-save').click()
  await expect(page.getByText('编辑采购')).toBeHidden({ timeout: 5_000 })
  await expect(page.getByText(`${v} (已编辑)`).first()).toBeVisible({ timeout: 5_000 })
})

test('NodeWorkspace purchase delete requires confirmation and then offers undo', async ({
  page,
}) => {
  await gotoDemo(page)
  const { node } = await firstNodeWithPurchases(page)
  await openNodeInWorkspace(page, node)

  const deleteBtns = page.locator('[data-testid^="node-purchase-delete-"]')
  await expect(deleteBtns.first()).toBeVisible({ timeout: 10_000 })
  const firstRow = page.locator('.purchase-table tbody tr').first()
  const purchaseName = (await firstRow.locator('.item-name').first().textContent())?.trim() ?? ''
  expect(purchaseName.length).toBeGreaterThan(0)

  // Cancel path → row still there.
  await deleteBtns.first().click()
  await expect(page.getByText('删除这笔采购？')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('confirm-cancel').click()
  await expect(page.getByText(purchaseName, { exact: false }).first()).toBeVisible()

  // Confirm path → row hides + undo toast appears + undo restores.
  await deleteBtns.first().click()
  await expect(page.getByText('删除这笔采购？')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByText('已删除采购')).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByText(purchaseName, { exact: false }).first()).toBeVisible({
    timeout: 5_000,
  })
})

test('budget appears on the dashboard with progress bar and over-budget warning', async ({
  page,
}) => {
  await gotoDemo(page)
  // The demo seed sets budget=¥200,000; spent < 200,000 so the bar is
  // not over budget.
  await page.getByRole('button', { name: /总览/ }).first().click()
  const card = page.getByTestId('budget-card')
  await expect(card).toBeVisible({ timeout: 10_000 })
  await expect(card.getByTestId('budget-bar')).toBeVisible()
  await expect(card.getByTestId('budget-pct')).toContainText('%')

  // Set the budget very low in Settings, then check the over-budget
  // warning kicks in.
  await page.getByRole('button', { name: /设置/ }).first().click()
  const budgetInput = page.getByTestId('settings-budget')
  await expect(budgetInput).toBeVisible({ timeout: 10_000 })
  await budgetInput.fill('1000')
  await page.getByRole('button', { name: '保存' }).first().click()
  await page.getByRole('button', { name: /总览/ }).first().click()
  await expect(page.getByTestId('budget-status')).toContainText('超预算', {
    timeout: 10_000,
  })
})

test('purchase categories are editable in Settings and surface in the drawer', async ({
  page,
}) => {
  await gotoDemo(page)
  await page.getByRole('button', { name: /设置/ }).first().click()
  await expect(page.getByTestId('category-manager')).toBeVisible({ timeout: 10_000 })

  // Add a custom category.
  await page.getByTestId('category-new-input').fill('窗帘软装')
  await page.getByTestId('category-add').click()
  await expect(page.getByTestId('category-row-窗帘软装')).toBeVisible()

  // Delete one of the defaults to prove the list is editable.
  await page.getByTestId('category-delete-辅材').click()
  await expect(page.getByTestId('category-row-辅材')).toBeHidden()

  // Open the PurchaseDrawer from the topbar — custom category is in the
  // dropdown, removed default is not.
  await page.keyboard.press('Meta+N')
  // Cmd+N may not register on linux CI; fall back to clicking the +记一笔
  // button in the dashboard header.
  if (!(await page.getByTestId('purchase-category').count())) {
    await page.getByRole('button', { name: /总览/ }).first().click()
    await page.getByRole('button', { name: '+ 记一笔' }).click()
  }
  const select = page.getByTestId('purchase-category')
  await expect(select).toBeVisible({ timeout: 5_000 })
  const options = await select.locator('option').allTextContents()
  expect(options).toContain('窗帘软装')
  expect(options).not.toContain('辅材')
})
