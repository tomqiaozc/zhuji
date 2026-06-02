/**
 * Demo loader — delegates to the backend's POST /api/projects/load-demo
 * endpoint. Returns the same shape the rest of the app expects so call
 * sites (EmptyHero / App / Settings) don't need to change.
 *
 * The "clear all data" affordance now only wipes the local cache: real
 * data lives server-side; users should use account deletion (future
 * feature) or log out to drop their local copy. Leaving the helper in
 * place keeps the Settings panel from crashing.
 */

import {
  clearLocalCache,
  loadDemoProject as repoLoadDemo,
  type LoadDemoResult,
} from '@/lib/repository'

export type DemoSeedResult = LoadDemoResult

export async function loadDemoProject(): Promise<DemoSeedResult> {
  return repoLoadDemo()
}

export async function clearAllData(): Promise<void> {
  // No longer destroys server data — only resets the local cache. This is
  // mostly useful as a "force re-sync" button.
  await clearLocalCache()
}
