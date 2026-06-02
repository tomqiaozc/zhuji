import { pushActionToast, pushToast, dismissToast } from './toast'

/**
 * Register the service worker manually and surface a "new version
 * available — reload?" toast when an update is ready. This replaces the
 * vite-plugin-pwa `autoUpdate` flow, which would silently swap out the
 * SW under the user's feet and could lose in-progress edits on the next
 * navigation.
 *
 * Safe to call in any environment — in dev (no SW) or when virtual:pwa-register
 * isn't available, this becomes a no-op.
 */
export async function registerPwa(): Promise<void> {
  // The virtual module is only resolvable when the pwa plugin runs the
  // build, so guard the import and bail silently otherwise (e.g. vitest).
  try {
    const mod = (await import(/* @vite-ignore */ 'virtual:pwa-register')) as {
      registerSW: (opts: {
        immediate?: boolean
        onNeedRefresh?: () => void
        onOfflineReady?: () => void
        onRegisterError?: (err: unknown) => void
      }) => (reload?: boolean) => Promise<void>
    }
    let toastId: string | null = null
    const updateSW = mod.registerSW({
      immediate: true,
      onNeedRefresh() {
        if (toastId) dismissToast(toastId)
        toastId = pushActionToast(
          '有新版本可用，刷新以更新',
          {
            label: '刷新',
            onClick: () => {
              if (toastId) dismissToast(toastId)
              void updateSW(true)
            },
          },
          'info',
        )
      },
      onOfflineReady() {
        pushToast('已可离线使用', 'success', 3000)
      },
      onRegisterError(err) {
        console.warn('SW register failed', err)
      },
    })
  } catch (err) {
    // No SW in this environment (dev mode, tests, unsupported browser).
    console.debug('PWA registration skipped', err)
  }
}
