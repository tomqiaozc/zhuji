import { test, expect } from '@playwright/test'
import { freshSession, loadDemo, parseMoney } from './helpers'

test.beforeEach(async ({ page }) => {
  await freshSession(page)
})

// 1. 冷启动 + 加载示例：Dashboard 显示 mock 数据
test('cold-start + load demo populates Dashboard', async ({ page }) => {
  await page.goto('/')
  // 首次进入应弹出新建项目，并提供 Load Demo 按钮
  await expect(page.getByTestId('btn-load-demo-modal')).toBeVisible()
  await page.getByTestId('btn-load-demo-modal').click()

  // 项目切换器应显示示范家
  await expect(page.getByText('示范家 · 89㎡', { exact: false }).first()).toBeVisible()

  // 进入总览
  await page.getByRole('button', { name: /总览/ }).first().click()

  // 进度环不为 0%
  const progressText = await page.locator('.progress-ring .ring span').first().textContent()
  const progress = Number(progressText?.replace('%', ''))
  expect(progress).toBeGreaterThan(0)

  // 累计支出在 60k - 80k 区间
  const totalText = await page.locator('.metric .num').first().textContent()
  const total = await parseMoney(totalText ?? '')
  expect(total).toBeGreaterThanOrEqual(60_000)
  expect(total).toBeLessThanOrEqual(80_000)

  // 最近采购列表非空
  await expect(page.locator('.activity-list .activity-item').first()).toBeVisible()
})

// 2. 节点工作台：进入水电改造，切换 Tab，勾选 Checklist
test('node workspace: 4 tabs + checklist toggling updates progress', async ({ page }) => {
  await loadDemo(page)

  await page.getByRole('button', { name: /节点工作台/ }).click()

  // 选「水电改造 / 水路改造」节点
  await page.getByRole('button', { name: '水路改造' }).first().click()

  const tabs = page.locator('.tabs')

  // 切换 4 个 Tab — 用 dispatchEvent('click') 绕过 sticky tabs 的偶发拦截
  await tabs.locator('button.tab', { hasText: '避坑清单' }).dispatchEvent('click')
  await expect(page.locator('.tip-section-title')).toContainText('避坑要点')

  await tabs.locator('button.tab', { hasText: 'Checklist' }).dispatchEvent('click')
  await expect(page.locator('.check-progress')).toBeVisible()

  // 找一个未勾选项，勾上
  const before = await page.locator('.check-progress strong').textContent()
  const beforeDone = Number(before?.split('/')[0] ?? 0)

  const unchecked = page.locator('.check-item:not(.done) input[type="checkbox"]').first()
  await unchecked.click()
  await expect(page.locator('.check-progress strong')).toContainText(`${beforeDone + 1}/`)

  await tabs.locator('button.tab', { hasText: '采购' }).dispatchEvent('click')
  await expect(page.locator('.purchase-toolbar')).toBeVisible()

  await tabs.locator('button.tab', { hasText: '备注' }).dispatchEvent('click')
  await expect(page.locator('textarea.notes-area')).toBeVisible()
})

// 3. 记账：填写完整字段（含购买链接），校验流水页 + Dashboard 累计支出
test('purchase drawer: full fields including purchaseUrl, then flows to list + dashboard', async ({
  page,
}) => {
  await loadDemo(page)

  // 从 Dashboard 累计支出取基线
  const baseText = await page.locator('.metric .num').first().textContent()
  const base = await parseMoney(baseText ?? '')

  // 打开记一笔
  await page.getByRole('button', { name: '+ 记一笔' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.getByPlaceholder('如：马可波罗 通体大理石瓷砖').fill('E2E 测试灯具')
  await page.getByPlaceholder('800x800').fill('40W')
  await page.getByPlaceholder('马可波罗', { exact: true }).fill('测试品牌')
  await page.getByPlaceholder('天猫 / 京东 / 实体店').fill('京东')
  await page.locator('input[type="number"]').first().fill('250')
  await page.locator('input[type="number"]').nth(1).fill('2')
  await page
    .getByPlaceholder('https://detail.tmall.com/item.htm?id=...')
    .fill('https://example.com/item/123')
  await page.getByPlaceholder('尺寸、安装注意事项…').fill('E2E 备注')

  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  // 流水页校验
  await page.getByRole('button', { name: /采购流水/ }).click()
  await expect(page.getByText('E2E 测试灯具')).toBeVisible()
  // 购买链接渲染为 <a>
  await expect(
    page.getByRole('link', { name: 'E2E 测试灯具' })
  ).toHaveAttribute('href', 'https://example.com/item/123')

  // Dashboard 累计 +500
  await page.getByRole('button', { name: /总览/ }).click()
  const expected = base + 500
  await expect
    .poll(async () => parseMoney((await page.locator('.metric .num').first().textContent()) ?? ''))
    .toBe(expected)
})

// 4. 筛选 + 导出
test('filter by category + Excel export triggers a download', async ({ page }) => {
  await loadDemo(page)
  await page.getByRole('button', { name: /采购流水/ }).click()

  // 等表格渲染（useLiveQuery 解析后才会出现行）
  await expect(page.locator('.purchase-table tbody tr').first()).toBeVisible()
  const rowsBefore = await page.locator('.purchase-table tbody tr').count()
  expect(rowsBefore).toBeGreaterThan(0)

  // 品类筛选 — 选择「主材」
  await page.locator('select').nth(2).selectOption('主材')
  await expect
    .poll(async () => page.locator('.purchase-table tbody tr').count())
    .toBeGreaterThan(0)
  const rowsAfter = await page.locator('.purchase-table tbody tr').count()
  expect(rowsAfter).toBeLessThan(rowsBefore)

  // 每行品类都应是「主材」
  const tags = await page.locator('.purchase-table tbody tr .tag').allTextContents()
  for (const t of tags) expect(t.trim()).toBe('主材')

  // 导出 Excel — 触发 download 事件
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /导出 Excel/ }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/筑迹-.*\.xlsx$/)
})

// 5. 项目切换：新建第二个项目，校验 Dashboard 数据隔离
test('project switching isolates Dashboard data', async ({ page }) => {
  await loadDemo(page)

  // 在 Dashboard 记下示范项目的支出
  const demoBaseText = await page.locator('.metric .num').first().textContent()
  const demoBase = await parseMoney(demoBaseText ?? '')
  expect(demoBase).toBeGreaterThan(0)

  // 用项目切换器新建项目
  await page.getByRole('button', { name: '切换项目' }).click()
  await page.getByRole('menuitem', { name: /新建项目/ }).click()
  await page.getByPlaceholder('如：朝阳保利和光屿湖').fill('E2E 第二个项目')
  await page.getByRole('button', { name: '创建项目' }).click()

  // 等切到新项目（Dashboard 累计支出为 ¥0）
  await page.getByRole('button', { name: /总览/ }).first().click()
  await expect
    .poll(async () => parseMoney((await page.locator('.metric .num').first().textContent()) ?? ''))
    .toBe(0)

  // 切回示范项目
  await page.getByRole('button', { name: '切换项目' }).click()
  await page.getByRole('menuitem', { name: /示范家/ }).click()
  await page.getByRole('button', { name: /总览/ }).first().click()
  await expect
    .poll(async () => parseMoney((await page.locator('.metric .num').first().textContent()) ?? ''))
    .toBe(demoBase)
})

// 6. 持久化：刷新后数据仍在
test('IndexedDB persistence survives reload', async ({ page }) => {
  await loadDemo(page)

  const beforeText = await page.locator('.metric .num').first().textContent()
  const before = await parseMoney(beforeText ?? '')
  expect(before).toBeGreaterThan(0)

  await page.reload()
  await expect(page.getByText('示范家 · 89㎡', { exact: false }).first()).toBeVisible()

  const afterText = await page.locator('.metric .num').first().textContent()
  const after = await parseMoney(afterText ?? '')
  expect(after).toBe(before)
})

// 7. PurchaseDrawer 校验
test('PurchaseDrawer validation: price=0 / empty qty / empty date', async ({ page }) => {
  await loadDemo(page)
  await page.getByRole('button', { name: '+ 记一笔' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.getByPlaceholder('如：马可波罗 通体大理石瓷砖').fill('校验测试')

  // 单价 = 0
  await page.locator('input[type="number"]').first().fill('0')
  await page.locator('input[type="number"]').nth(1).fill('1')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.locator('text=单价必须大于 0')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()

  // 数量为空
  await page.locator('input[type="number"]').first().fill('100')
  await page.locator('input[type="number"]').nth(1).fill('')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.locator('text=数量必须大于 0')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()

  // 日期为空
  await page.locator('input[type="number"]').nth(1).fill('1')
  await page.locator('input[type="date"]').first().fill('')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.locator('text=请选择购买日期')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
})
