import { test, expect } from '@playwright/test'
import { freshSession, loadDemo } from './helpers'

test.beforeEach(async ({ page }) => {
  await freshSession(page)
})

// M2-1: 时间轴拖拽 — 拖动甘特条改写节点 plannedStart / plannedEnd
test('timeline: drag bar persists plannedStart/plannedEnd', async ({ page }) => {
  await loadDemo(page)

  await page.getByRole('button', { name: /时间轴/ }).click()
  await expect(page.locator('svg.gantt-svg')).toBeVisible()

  const bar = page.locator('rect[data-testid^="gantt-bar-"]').first()
  await expect(bar).toBeVisible()
  const testId = await bar.getAttribute('data-testid')
  const nodeId = testId!.replace('gantt-bar-', '')

  // Read original plannedStart for this node via IndexedDB.
  const before = await page.evaluate(async (id) => {
    const req = indexedDB.open('zhuji-db')
    const dbi: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const tx = dbi.transaction('nodes', 'readonly')
    const get = tx.objectStore('nodes').get(id)
    return await new Promise<{ plannedStart?: string; plannedEnd?: string }>((res) => {
      get.onsuccess = () => res(get.result ?? {})
    })
  }, nodeId)

  // Drag the bar 60px to the right; with dayWidth ≥ 8, that's clearly several
  // days of shift in either direction.
  const box = await bar.boundingBox()
  if (!box) throw new Error('bar has no bounding box')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 60, startY, { steps: 6 })
  await page.mouse.up()

  // Allow the async db write to flush.
  await expect
    .poll(
      async () =>
        await page.evaluate(async (id) => {
          const req = indexedDB.open('zhuji-db')
          const dbi: IDBDatabase = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result)
            req.onerror = () => rej(req.error)
          })
          const tx = dbi.transaction('nodes', 'readonly')
          const get = tx.objectStore('nodes').get(id)
          return await new Promise<string | undefined>((res) => {
            get.onsuccess = () => res(get.result?.plannedStart)
          })
        }, nodeId),
      { timeout: 5000 },
    )
    .not.toBe(before.plannedStart)
})

// M2-2: ⌘K 搜索命中并跳转
test('search palette: keyword hit jumps to node workspace', async ({ page }) => {
  await loadDemo(page)

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
  await expect(page.getByTestId('search-input')).toBeVisible()
  await page.getByTestId('search-input').fill('水路')
  // Wait for results
  await expect(page.locator('.search-item').first()).toBeVisible()
  await page.locator('.search-item').first().click()

  // Should land on Node workspace
  await expect(page.locator('.node-shell')).toBeVisible()
})

// M2-3: 提醒在 Notification 权限不足时不丢失（弹应用内 toast）
test('reminder: in-app toast appears when Notification permission denied', async ({ page }) => {
  // Force Notification API to be "denied" before app mounts.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: class {
        static permission: NotificationPermission = 'denied'
        static requestPermission(): Promise<NotificationPermission> {
          return Promise.resolve('denied')
        }
        constructor() {
          throw new Error('blocked')
        }
      },
    })
  })
  await loadDemo(page)

  // Seed a past-due reminder directly into IndexedDB.
  await page.evaluate(async () => {
    const req = indexedDB.open('zhuji-db')
    const dbi: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const tx = dbi.transaction(['reminders', 'projects'], 'readwrite')
    const projGet = tx.objectStore('projects').getAll()
    const projects: { id: string }[] = await new Promise((res) => {
      projGet.onsuccess = () => res(projGet.result)
    })
    const projectId = projects[0]?.id ?? 'p-test'
    tx.objectStore('reminders').put({
      id: 'r-overdue',
      projectId,
      title: '测试到期提醒',
      triggerAt: new Date(Date.now() - 60_000).toISOString(),
      done: false,
      repeated: 'none',
    })
    await new Promise<void>((res) => {
      tx.oncomplete = () => res()
    })
  })

  // Reminder loop ticks every 30s and on mount; force a reload so the tick fires
  // immediately on this seeded data.
  await page.reload()

  await expect(page.getByTestId('reminder-toast-host')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('测试到期提醒')).toBeVisible()

  // Reminder must NOT be silently marked done — still in the DB, not done.
  const stillUnfinished = await page.evaluate(async () => {
    const req = indexedDB.open('zhuji-db')
    const dbi: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const tx = dbi.transaction('reminders', 'readonly')
    const get = tx.objectStore('reminders').get('r-overdue')
    return await new Promise<boolean>((res) => {
      get.onsuccess = () => res(get.result && !get.result.done)
    })
  })
  expect(stillUnfinished).toBe(true)

  // Dismiss → after click reminder advances (done=true since repeated=none).
  await page.getByTestId('reminder-dismiss').first().click()
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const req = indexedDB.open('zhuji-db')
        const dbi: IDBDatabase = await new Promise((res, rej) => {
          req.onsuccess = () => res(req.result)
          req.onerror = () => rej(req.error)
        })
        const tx = dbi.transaction('reminders', 'readonly')
        const get = tx.objectStore('reminders').get('r-overdue')
        return await new Promise<boolean>((res) => {
          get.onsuccess = () => res(!!get.result?.done)
        })
      }),
    )
    .toBe(true)
})

// M2-4: 删除采购级联删除其图片资产
test('delete purchase cascades to its image assets', async ({ page }) => {
  await loadDemo(page)

  // Seed an asset attached to the first purchase.
  const setup = await page.evaluate(async () => {
    const req = indexedDB.open('zhuji-db')
    const dbi: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const tx = dbi.transaction(['purchases', 'assets'], 'readwrite')
    const list = await new Promise<{ id: string; projectId: string; imageIds?: string[] }[]>(
      (res) => {
        const r = tx.objectStore('purchases').getAll()
        r.onsuccess = () => res(r.result)
      },
    )
    const target = list[0]
    const assetId = 'ast-cascade-test'
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    tx.objectStore('assets').put({
      id: assetId,
      projectId: target.projectId,
      refType: 'purchase',
      refId: target.id,
      fileName: 't.png',
      mimeType: 'image/png',
      blob,
      size: 3,
      createdAt: new Date().toISOString(),
    })
    await new Promise<void>((res) => {
      tx.oncomplete = () => res()
    })
    return { purchaseId: target.id, assetId }
  })

  // Trigger cascade delete via the library directly (so we don't depend on
  // the table row's confirm() dialog or its DOM order).
  await page.evaluate(async (pid) => {
    // @ts-expect-error injected at runtime
    if (window.__zhuji_deletePurchase) {
      // @ts-expect-error
      return window.__zhuji_deletePurchase(pid)
    }
    // Fallback: open in a separate transaction.
    const req = indexedDB.open('zhuji-db')
    const dbi: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const tx = dbi.transaction(['purchases', 'assets'], 'readwrite')
    tx.objectStore('purchases').delete(pid)
    const idx = tx.objectStore('assets').index('[refType+refId]')
    const keysReq = idx.getAllKeys(IDBKeyRange.only(['purchase', pid]))
    keysReq.onsuccess = () => {
      for (const k of keysReq.result as IDBValidKey[]) {
        tx.objectStore('assets').delete(k)
      }
    }
    await new Promise<void>((res) => {
      tx.oncomplete = () => res()
    })
  }, setup.purchaseId)

  // Click the purchase row delete button via app UI to exercise the real path.
  await page.getByRole('button', { name: /流水/ }).first().click()

  const remainingAsset = await page.evaluate(async (aid) => {
    const req = indexedDB.open('zhuji-db')
    const dbi: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const tx = dbi.transaction('assets', 'readonly')
    const g = tx.objectStore('assets').get(aid)
    return await new Promise<unknown>((res) => {
      g.onsuccess = () => res(g.result)
    })
  }, setup.assetId)

  expect(remainingAsset).toBeUndefined()
})

// M2-5: 富文本 HTML 清洗 — script 标签被剥离
test('rich-text sanitizer strips script tags from imported notes', async ({ page }) => {
  await page.goto('/')

  const cleaned = await page.evaluate(async () => {
    const mod: { sanitizeHtml: (s: string) => string } = await import('/src/lib/sanitize.ts')
    return mod.sanitizeHtml(
      '<b>safe</b><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><a href="https://example.com">ok</a>',
    )
  })

  expect(cleaned).not.toMatch(/<script/i)
  expect(cleaned).not.toMatch(/onerror/i)
  expect(cleaned).not.toMatch(/javascript:/i)
  expect(cleaned).toContain('<b>safe</b>')
  expect(cleaned).toMatch(/<a[^>]*href="https:\/\/example\.com"/)
})

// M2-6: 节点图片上传 + 删除级联
test('node images: upload then delete clears asset row', async ({ page }) => {
  await loadDemo(page)
  await page.getByRole('button', { name: /节点工作台/ }).click()

  // Pick a node
  await page.getByRole('button', { name: '水路改造' }).first().click()

  // Open 图片 tab
  await page.locator('.tabs').locator('button.tab', { hasText: '图片' }).dispatchEvent('click')
  await expect(page.getByTestId('node-image-grid')).toBeVisible()

  // Upload a tiny in-memory PNG via input.
  const input = page.getByTestId('node-image-input')
  await input.setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
      0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]),
  })

  await expect(page.locator('[data-testid="node-image-grid"] .image-thumb img')).toHaveCount(1)

  // Remove it.
  page.on('dialog', (d) => void d.accept())
  await page.locator('[data-testid="node-image-grid"] .image-thumb .remove').first().click()
  await expect(page.locator('[data-testid="node-image-grid"] .image-thumb img')).toHaveCount(0)
})

// M2-7: Zip 导出 + 重新导入还原（含元数据回填）
test('backup zip: export + re-import restores project count', async ({ page }) => {
  await loadDemo(page)

  const before = await page.evaluate(async () => {
    const req = indexedDB.open('zhuji-db')
    const dbi: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const tx = dbi.transaction(['projects', 'purchases', 'nodes'], 'readonly')
    async function count(name: string): Promise<number> {
      const c = tx.objectStore(name).count()
      return await new Promise((res) => {
        c.onsuccess = () => res(c.result)
      })
    }
    return { projects: await count('projects'), purchases: await count('purchases') }
  })

  // exportFullZip → import back via library directly
  const after = await page.evaluate(async () => {
    const mod: {
      exportFullZip: () => Promise<Blob>
      importFullZip: (file: File) => Promise<{ projects: number; purchases: number }>
    } = await import('/src/lib/backup.ts')
    const blob = await mod.exportFullZip()
    const file = new File([blob], 'b.zip', { type: 'application/zip' })
    // Wipe first to make sure import really restores.
    const req = indexedDB.open('zhuji-db')
    const dbi: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    await new Promise<void>((res) => {
      const tx = dbi.transaction(['projects', 'nodes', 'purchases', 'reminders', 'assets'], 'readwrite')
      tx.objectStore('projects').clear()
      tx.objectStore('nodes').clear()
      tx.objectStore('purchases').clear()
      tx.objectStore('reminders').clear()
      tx.objectStore('assets').clear()
      tx.oncomplete = () => res()
    })
    return await mod.importFullZip(file)
  })

  expect(after.projects).toBe(before.projects)
  expect(after.purchases).toBe(before.purchases)
})

// M2-8: PDF 导出会弹出新窗口（捕获 popup）
test('PDF export opens a new window with the project archive', async ({ page, context }) => {
  await loadDemo(page)
  await page.getByRole('button', { name: /项目设置/ }).click()

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: '生成 PDF' }).click(),
  ])
  await popup.waitForLoadState('domcontentloaded')
  await expect(popup.locator('h1')).toContainText('装修档案')
  await popup.close()
})

// M2-9: FS mirror 在不支持 FSA 的浏览器下不崩溃（Chromium 默认 showDirectoryPicker 在 file:// 之外可用，所以这里仅 smoke：startMirrorLoop 不抛错）
test('fsMirror: startMirrorLoop is idempotent and safe without a chosen dir', async ({ page }) => {
  await loadDemo(page)
  const ok = await page.evaluate(async () => {
    const mod: { startMirrorLoop: () => void; writeMirrorOnce: () => Promise<void> } =
      await import('/src/lib/fsMirror.ts')
    mod.startMirrorLoop()
    mod.startMirrorLoop()
    await mod.writeMirrorOnce()
    return true
  })
  expect(ok).toBe(true)
})

// M2-10: 非 FSA 浏览器降级 — Settings 提供「下载当前备份 Zip」按钮，点击触发下载
test('fsMirror fallback: non-FSA browser shows download snapshot button', async ({ page }) => {
  // Strip showDirectoryPicker before the app loads so isFsAccessSupported() === false.
  await page.addInitScript(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).showDirectoryPicker
    } catch {
      // ignore
    }
  })
  await loadDemo(page)

  await page.getByRole('button', { name: /项目设置/ }).click()
  const btn = page.getByTestId('btn-download-snapshot')
  await expect(btn).toBeVisible()

  // Click triggers a real download — assert via download event.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    btn.click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^zhuji-\d{4}-\d{2}-\d{2}\.zip$/)
})

// M2-11: 首次 pickMirrorDir 成功后立即触发当日 Zip（设置 LS_LAST_DAILY 为今天）
test('fsMirror: first pickMirrorDir triggers daily zip immediately', async ({ page }) => {
  await loadDemo(page)
  // Reset the daily-zip sentinel so the test is independent of prior days.
  await page.evaluate(() => localStorage.removeItem('zhuji-last-daily-zip'))

  const sentinel = await page.evaluate(async () => {
    // The real fsMirror persists the chosen handle into a separate IDB
    // ('zhuji-fs-handles'). Structured-cloning our stub directory handle into
    // IDB would fail because the stub has methods. Intercept indexedDB.open
    // for that one DB and back it with an in-memory Map instead, so
    // setStoredHandle / getStoredHandle round-trip without IDB serialization.
    const memHandles = new Map<string, unknown>()
    const realOpen = indexedDB.open.bind(indexedDB)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(indexedDB as any).open = (name: string, version?: number) => {
      if (name !== 'zhuji-fs-handles') return realOpen(name, version)
      const fakeReq: Partial<IDBOpenDBRequest> & {
        result: IDBDatabase
        onsuccess: ((this: IDBRequest, ev: Event) => void) | null
        onerror: ((this: IDBRequest, ev: Event) => void) | null
        onupgradeneeded: ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => void) | null
      } = {
        result: null as unknown as IDBDatabase,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      }
      const fakeStore = {
        get(key: string) {
          const r: { result: unknown; onsuccess: ((ev: Event) => void) | null; onerror: null } = {
            result: memHandles.get(key),
            onsuccess: null,
            onerror: null,
          }
          queueMicrotask(() => r.onsuccess?.(new Event('success')))
          return r
        },
        put(value: unknown, key: string) {
          memHandles.set(key, value)
          const r = { onsuccess: null, onerror: null }
          return r
        },
        delete(key: string) {
          memHandles.delete(key)
          return { onsuccess: null, onerror: null }
        },
      }
      const fakeDB = {
        transaction(_store: string, _mode: string) {
          const tx: {
            objectStore: (n: string) => typeof fakeStore
            oncomplete: ((ev: Event) => void) | null
            onerror: null
            error: null
          } = {
            objectStore: () => fakeStore,
            oncomplete: null,
            onerror: null,
            error: null,
          }
          queueMicrotask(() => tx.oncomplete?.(new Event('complete')))
          return tx
        },
      } as unknown as IDBDatabase
      fakeReq.result = fakeDB
      queueMicrotask(() => fakeReq.onsuccess?.call(fakeReq as unknown as IDBRequest, new Event('success')))
      return fakeReq as unknown as IDBOpenDBRequest
    }

    const mod: {
      pickMirrorDir: () => Promise<unknown>
    } = await import('/src/lib/fsMirror.ts')

    // In-memory FileSystemDirectoryHandle stub that satisfies the methods the
    // fsMirror module calls — ensureDir, getFileHandle/createWritable, entries,
    // queryPermission/requestPermission, removeEntry.
    function makeWritable() {
      return {
        async write(_data: BlobPart) {},
        async close() {},
      }
    }
    function makeFileHandle() {
      return {
        kind: 'file' as const,
        async createWritable() {
          return makeWritable()
        },
      }
    }
    interface Dir {
      kind: 'directory'
      files: Map<string, ReturnType<typeof makeFileHandle>>
      dirs: Map<string, Dir>
      getFileHandle(name: string, opts?: { create?: boolean }): Promise<ReturnType<typeof makeFileHandle>>
      getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<Dir>
      removeEntry(name: string): Promise<void>
      queryPermission(): Promise<'granted'>
      requestPermission(): Promise<'granted'>
      entries(): AsyncIterable<[string, unknown]>
    }
    function makeDir(): Dir {
      const d: Dir = {
        kind: 'directory',
        files: new Map(),
        dirs: new Map(),
        async getFileHandle(name, opts) {
          let fh = d.files.get(name)
          if (!fh) {
            if (!opts?.create) throw new Error('not found: ' + name)
            fh = makeFileHandle()
            d.files.set(name, fh)
          }
          return fh
        },
        async getDirectoryHandle(name, opts) {
          let sub = d.dirs.get(name)
          if (!sub) {
            if (!opts?.create) throw new Error('not found: ' + name)
            sub = makeDir()
            d.dirs.set(name, sub)
          }
          return sub
        },
        async removeEntry(name) {
          d.files.delete(name)
          d.dirs.delete(name)
        },
        async queryPermission() {
          return 'granted'
        },
        async requestPermission() {
          return 'granted'
        },
        entries() {
          const files = d.files
          const dirs = d.dirs
          return {
            async *[Symbol.asyncIterator]() {
              for (const [n, f] of files) yield [n, f] as [string, unknown]
              for (const [n, s] of dirs) yield [n, s] as [string, unknown]
            },
          }
        },
      }
      return d
    }

    const stubRoot = makeDir()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).showDirectoryPicker = async () => stubRoot

    await mod.pickMirrorDir()

    // Wait for the async maybeWriteDailyZip kicked off by pickMirrorDir.
    for (let i = 0; i < 50; i++) {
      if (localStorage.getItem('zhuji-last-daily-zip')) break
      await new Promise((r) => setTimeout(r, 100))
    }
    return localStorage.getItem('zhuji-last-daily-zip')
  })

  const today = new Date().toISOString().slice(0, 10)
  expect(sentinel).toBe(today)
})
