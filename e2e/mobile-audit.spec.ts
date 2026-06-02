import { test, expect, type Page } from '@playwright/test'
import { freshSession, registerNewUser, uniqueUsername } from './helpers'
import fs from 'node:fs'
import path from 'node:path'

const SCREENS = path.resolve(process.cwd(), '.mobile-audit')
if (!fs.existsSync(SCREENS)) fs.mkdirSync(SCREENS, { recursive: true })

const VIEWPORTS = [
  { name: 'se-375', width: 375, height: 667 },
  { name: 'std-390', width: 390, height: 844 },
  { name: 'plus-430', width: 430, height: 932 },
]

type Issue = { tag: string; viewport: string; detail: string }
const issues: Issue[] = []

function logIssue(viewport: string, tag: string, detail: string) {
  issues.push({ tag, viewport, detail })
  console.log(`ISSUE [${viewport}] ${tag}: ${detail}`)
}

async function snap(page: Page, vp: string, name: string) {
  const file = path.join(SCREENS, `${vp}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
}

async function checkOverflow(page: Page, vp: string, where: string) {
  const data = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  if (data.scrollWidth > data.clientWidth + 1) {
    logIssue(
      vp,
      'horizontal-overflow',
      `${where}: documentElement.scrollWidth=${data.scrollWidth} > clientWidth=${data.clientWidth}`,
    )
  }
  // Find offending elements
  const offenders = await page.evaluate((cw: number) => {
    const out: { tag: string; cls: string; right: number; w: number; testid: string }[] = []
    const all = document.querySelectorAll<HTMLElement>('body *')
    for (const el of Array.from(all).slice(0, 4000)) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right > cw + 1) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 60),
          right: Math.round(r.right),
          w: Math.round(r.width),
          testid: el.dataset.testid || '',
        })
      }
      if (out.length > 6) break
    }
    return out
  }, data.clientWidth)
  if (offenders.length) {
    logIssue(
      vp,
      'overflow-offenders',
      `${where}: ${JSON.stringify(offenders)}`,
    )
  }
}

async function checkTouchTargets(page: Page, vp: string, where: string) {
  const small = await page.evaluate(() => {
    const out: { tag: string; cls: string; w: number; h: number; text: string }[] = []
    const cand = document.querySelectorAll<HTMLElement>(
      'button, a, input[type=checkbox], input[type=radio], [role=button], [role=tab], [role=link]',
    )
    for (const el of Array.from(cand)) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // visible only
      const cs = window.getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      if (r.width < 36 || r.height < 36) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 50),
          w: Math.round(r.width),
          h: Math.round(r.height),
          text: (el.textContent || '').trim().slice(0, 30),
        })
      }
      if (out.length > 25) break
    }
    return out
  })
  if (small.length) {
    logIssue(
      vp,
      'small-tap-targets',
      `${where}: ${small.length} elements <36px; sample=${JSON.stringify(small.slice(0, 8))}`,
    )
  }
}

async function inspectInputs(page: Page, vp: string, where: string) {
  const inputs = await page.evaluate(() => {
    const out: { type: string; name: string; inputmode: string; placeholder: string; testid: string }[] = []
    document.querySelectorAll<HTMLInputElement>('input,textarea').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      out.push({
        type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
        name: (el as HTMLInputElement).name || '',
        inputmode: (el as HTMLInputElement).inputMode || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
        testid: el.dataset.testid || '',
      })
    })
    return out
  })
  if (inputs.length) {
    logIssue(vp, 'form-inputs-snapshot', `${where}: ${JSON.stringify(inputs)}`)
  }
}

async function navTo(page: Page, name: RegExp) {
  // On mobile (≤720px) the sidebar is hidden; open it via hamburger.
  await page.getByRole('button', { name: '菜单' }).first().click().catch(() => {})
  await page.waitForTimeout(300)
  await page.getByRole('button', { name }).first().click()
  await page.waitForTimeout(800)
}

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test(`audit ${vp.name}`, async ({ page }) => {
      test.setTimeout(120_000)
      await freshSession(page)
      const username = uniqueUsername()

      // Auth page
      await page.goto('/')
      await snap(page, vp.name, '01-login')
      await checkOverflow(page, vp.name, 'login')
      await checkTouchTargets(page, vp.name, 'login')

      // Register flow
      await registerNewUser(page, username)
      await snap(page, vp.name, '02-empty-hero')
      await checkOverflow(page, vp.name, 'empty-hero')

      // Load demo project
      await page.getByTestId('empty-hero-demo').click()
      await expect(page.getByText('示范家 · 89㎡', { exact: false }).first()).toBeVisible({
        timeout: 30_000,
      })

      // Dashboard
      await navTo(page, /总览/)
      await page.waitForTimeout(2500)
      await snap(page, vp.name, '03-dashboard')
      await checkOverflow(page, vp.name, 'dashboard')
      await checkTouchTargets(page, vp.name, 'dashboard')

      // Topbar status
      const topbar = await page.evaluate(() => {
        const t = document.querySelector('.topbar')
        if (!t) return null
        const r = t.getBoundingClientRect()
        const children: any[] = []
        t.querySelectorAll<HTMLElement>(':scope > *').forEach((c) => {
          const cr = c.getBoundingClientRect()
          children.push({
            tag: c.tagName.toLowerCase(),
            cls: (c.className || '').toString().slice(0, 50),
            w: Math.round(cr.width),
            x: Math.round(cr.x),
            right: Math.round(cr.right),
            visible: cr.width > 0 && cr.height > 0,
          })
        })
        return { topbarW: Math.round(r.width), children }
      })
      if (topbar) {
        logIssue(vp.name, 'topbar-layout', JSON.stringify(topbar))
      }

      // Try opening sidebar via menu (mobile pattern). The Topbar may have a hamburger.
      const sidebarOpen = await page.evaluate(() => {
        const sb = document.querySelector('.sidebar') as HTMLElement | null
        if (!sb) return null
        const r = sb.getBoundingClientRect()
        return { x: Math.round(r.x), w: Math.round(r.width), visible: r.width > 0 && r.x < window.innerWidth }
      })
      logIssue(vp.name, 'sidebar-default', JSON.stringify(sidebarOpen))

      // Timeline
      await navTo(page, /时间轴/)
      await snap(page, vp.name, '04-timeline')
      await checkOverflow(page, vp.name, 'timeline')

      // Node workspace
      await navTo(page, /节点工作台/)
      await snap(page, vp.name, '05-node-workspace-tree')
      await checkOverflow(page, vp.name, 'node-workspace-tree')
      await checkTouchTargets(page, vp.name, 'node-workspace-tree')

      // Click first node
      const firstNode = page.locator('.node-link').first()
      if (await firstNode.count()) {
        await firstNode.click()
        await page.waitForTimeout(1500)
        await snap(page, vp.name, '06-node-detail')
        await checkOverflow(page, vp.name, 'node-detail')

        // Switch to 采购 tab
        const purchasesTab = page.locator('button.tab', { hasText: '采购' })
        if (await purchasesTab.count()) {
          await purchasesTab.first().dispatchEvent('click')
          await page.waitForTimeout(1000)
          await snap(page, vp.name, '07-node-purchases-tab')
          await checkOverflow(page, vp.name, 'node-purchases-tab')

          // Open record drawer
          const addBtn = page.getByRole('button', { name: /\+ ?加一笔/ })
          if (await addBtn.count()) {
            await addBtn.first().click()
            await page.waitForTimeout(1000)
            await snap(page, vp.name, '08-purchase-drawer')
            await checkOverflow(page, vp.name, 'purchase-drawer')
            await checkTouchTargets(page, vp.name, 'purchase-drawer')
            await inspectInputs(page, vp.name, 'purchase-drawer')

            // Drawer geometry
            const drawer = await page.evaluate(() => {
              const d = document.querySelector('.drawer, .purchase-drawer, [class*="drawer"]') as HTMLElement | null
              if (!d) return null
              const r = d.getBoundingClientRect()
              return { tag: d.tagName.toLowerCase(), cls: (d.className||'').toString().slice(0,80), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }
            })
            logIssue(vp.name, 'drawer-geometry', JSON.stringify(drawer))

            // close
            await page.keyboard.press('Escape').catch(() => {})
            await page.waitForTimeout(500)
          }
        }
      }

      // Purchases page (the big table)
      await navTo(page, /采购流水/)
      await snap(page, vp.name, '09-purchases-table')
      await checkOverflow(page, vp.name, 'purchases-table')

      // Search
      await page.keyboard.down('Meta')
      await page.keyboard.press('KeyK')
      await page.keyboard.up('Meta')
      await page.waitForTimeout(800)
      await snap(page, vp.name, '10-search')
      await checkOverflow(page, vp.name, 'search')
      await page.keyboard.press('Escape').catch(() => {})

      // Settings
      await navTo(page, /设置|项目设置/)
      await snap(page, vp.name, '11-settings')
      await checkOverflow(page, vp.name, 'settings')
      await checkTouchTargets(page, vp.name, 'settings')

      // Dump issues for this viewport
      const dump = JSON.stringify(issues.filter((i) => i.viewport === vp.name), null, 2)
      fs.writeFileSync(path.join(SCREENS, `issues-${vp.name}.json`), dump)
    })
  })
}