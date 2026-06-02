// Strict UUID v4 generation. We previously fell back to Math.random when
// crypto.randomUUID was missing, but every browser that runs this app
// (Chrome/Edge/Safari/Firefox at versions that support PWA + IndexedDB
// + IntersectionObserver) already ships crypto.randomUUID. Math.random
// is not cryptographically safe and was only a defensive paper trail.
export function uid(prefix = ''): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID is not available in this environment')
  }
  const rnd = crypto.randomUUID()
  return prefix ? `${prefix}_${rnd}` : rnd
}
