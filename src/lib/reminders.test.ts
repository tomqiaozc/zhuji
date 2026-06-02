import { afterEach, describe, expect, it, vi } from 'vitest'

// reminders.ts is mostly a polling loop that touches Dexie. Mocking the
// whole module graph isn't worth it — we focus on ensureNotificationPermission
// which is the only branch we can exercise in jsdom without poking the
// database.
import { ensureNotificationPermission } from './reminders'

const originalNotification = (globalThis as { Notification?: unknown }).Notification

function setNotification(stub: unknown) {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    writable: true,
    value: stub,
  })
}

function deleteNotification() {
  // `'Notification' in window` only returns false when the property is
  // actually gone — assigning `undefined` keeps the key present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).Notification
}

afterEach(() => {
  setNotification(originalNotification)
  vi.restoreAllMocks()
})

describe('ensureNotificationPermission', () => {
  it("returns 'denied' when Notification API is unavailable", async () => {
    deleteNotification()
    expect(await ensureNotificationPermission()).toBe('denied')
  })

  it('returns the current permission without re-prompting when already granted', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    setNotification(
      Object.assign(
        function FakeNotification() {
          throw new Error('should not construct in this test')
        },
        { permission: 'granted', requestPermission },
      ),
    )
    expect(await ensureNotificationPermission()).toBe('granted')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('prompts the user once when permission is the default', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    setNotification(
      Object.assign(
        function FakeNotification() {
          /* noop */
        },
        { permission: 'default', requestPermission },
      ),
    )
    expect(await ensureNotificationPermission()).toBe('granted')
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it("returns 'denied' when the browser throws while prompting", async () => {
    const requestPermission = vi.fn().mockRejectedValue(new Error('boom'))
    setNotification(
      Object.assign(
        function FakeNotification() {
          /* noop */
        },
        { permission: 'default', requestPermission },
      ),
    )
    expect(await ensureNotificationPermission()).toBe('denied')
  })
})
