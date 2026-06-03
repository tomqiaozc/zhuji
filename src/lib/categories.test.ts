import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_CATEGORIES,
  getCategories,
  resetCategories,
  setCategories,
  subscribeCategories,
} from './categories'

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    // jsdom localStorage is always available; ignore for safety.
  }
  // Reset module memo by setting + clearing through public API.
  resetCategories()
})

afterEach(() => {
  try {
    localStorage.clear()
  } catch {
    // see beforeEach
  }
})

describe('categories', () => {
  it('returns defaults on first call', () => {
    expect(getCategories()).toEqual(DEFAULT_CATEGORIES)
  })

  it('persists and reads back custom list', () => {
    setCategories(['A', 'B', 'C'])
    expect(getCategories()).toEqual(['A', 'B', 'C'])
  })

  it('dedupes and trims when saving', () => {
    setCategories(['A', '  A ', 'B', '', '  ', 'B'])
    expect(getCategories()).toEqual(['A', 'B'])
  })

  it('notifies subscribers on change', () => {
    let last: string[] = []
    const unsub = subscribeCategories((c) => (last = c))
    setCategories(['X'])
    expect(last).toEqual(['X'])
    unsub()
  })

  it('reset restores defaults', () => {
    setCategories(['A'])
    resetCategories()
    expect(getCategories()).toEqual(DEFAULT_CATEGORIES)
  })
})
