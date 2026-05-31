import { test, expect } from '@playwright/test'
import { freshSession, loadDemo } from './helpers'

test.beforeEach(async ({ page }) => {
  await freshSession(page)
})

// M3-1: 模板管理 — 设置 → 节点模板管理 → 编辑器打开 & 重置按钮存在
test('template editor opens from settings and exposes reset button', async ({ page }) => {
  await loadDemo(page)
  await page.getByRole('button', { name: /设置/ }).click()
  await page.getByTestId('btn-open-templates').click()
  await expect(page.getByTestId('template-editor')).toBeVisible()
  // 至少有一个阶段
  await expect(page.getByTestId('tpl-stage-0')).toBeVisible()
  // 重置按钮可见
  await expect(page.getByTestId('tpl-reset')).toBeVisible()
  await expect(page.getByTestId('tpl-save')).toBeVisible()
})

// M3-2: 图片相册/灯箱 — 节点图片 Tab 上传后可打开灯箱
test('node image upload + lightbox open/close', async ({ page }) => {
  await loadDemo(page)
  await page.getByRole('button', { name: /节点工作台/ }).click()
  // 选第一个节点（demo 默认有），切到图片 Tab
  const tabs = page.locator('.tabs')
  await tabs.locator('button.tab', { hasText: '图片' }).dispatchEvent('click')

  // 上传一张 1x1 png
  const onePxPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.getByTestId('node-image-input').setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: onePxPng,
  })

  // 等缩略图出现 → 点击 → 灯箱打开
  const thumb = page.getByTestId('image-thumb-img').first()
  await expect(thumb).toBeVisible({ timeout: 5000 })
  await thumb.click()
  await expect(page.getByTestId('image-lightbox')).toBeVisible()

  // Esc 关闭灯箱
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('image-lightbox')).toBeHidden()
})

// M3-3: Dashboard — 阶段花费分布条点击跳转到采购流水
test('clicking a stage segment jumps to purchases filtered by stage', async ({ page }) => {
  await loadDemo(page)
  // 阶段条上第一个 button 应可点击
  const seg = page.locator('[data-testid="stage-bar"] button').first()
  await expect(seg).toBeVisible()
  const stageName = await seg.getAttribute('aria-label')
  await seg.click()
  // 路由到采购流水视图
  await expect(page.locator('.view-title')).toHaveText('采购流水')
  // 阶段筛选下拉里应当被预选了对应阶段
  if (stageName) {
    const match = stageName.match(/^([^\s]+)/)
    if (match) {
      const stage = match[1]
      // 第一个 select 是 stageFilter
      await expect(page.locator('select').first()).not.toHaveValue('all')
      const value = await page.locator('select').first().inputValue()
      expect(value).toBe(stage)
    }
  }
})

// M3-3: Top 5 高价采购卡片渲染
test('top 5 high-price card shows up to 5 entries', async ({ page }) => {
  await loadDemo(page)
  const top = page.getByTestId('top-purchases')
  await expect(top).toBeVisible()
  const items = top.locator('li')
  const count = await items.count()
  expect(count).toBeGreaterThan(0)
  expect(count).toBeLessThanOrEqual(5)
})

// M3-3: 趋势图按周/按月切换
test('trend chart toggles week / month', async ({ page }) => {
  await loadDemo(page)
  await expect(page.getByTestId('trend-chart')).toBeVisible()
  await page.getByTestId('trend-grain-month').click()
  await expect(page.getByTestId('trend-chart')).toBeVisible()
  await page.getByTestId('trend-grain-week').click()
  await expect(page.getByTestId('trend-chart')).toBeVisible()
})

// M3-5: 空状态欢迎卡片 — 完全空数据库下首次进入显示欢迎屏
test('first-run empty hero is shown when no projects exist', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('empty-hero')).toBeVisible()
  await expect(page.getByTestId('empty-hero-create')).toBeVisible()
  await expect(page.getByTestId('empty-hero-demo')).toBeVisible()
})

// M3-6: 键盘快捷键帮助 — ? 弹出 → Esc 关闭
test('keyboard shortcuts help opens with ? and closes with Esc', async ({ page }) => {
  await loadDemo(page)
  await page.keyboard.press('?')
  await expect(page.getByTestId('keyboard-help')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('keyboard-help')).toBeHidden()
})

// M3-6: ⌘N 打开记一笔 drawer
test('cmd+n opens purchase drawer', async ({ page }) => {
  await loadDemo(page)
  const isMac = process.platform === 'darwin'
  await page.keyboard.press(isMac ? 'Meta+n' : 'Control+n')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})
