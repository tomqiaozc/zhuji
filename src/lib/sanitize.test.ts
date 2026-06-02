import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from './sanitize'

describe('sanitizeHtml', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
    expect(sanitizeHtml('')).toBe('')
  })

  it('strips <script> while keeping surrounding text', () => {
    const out = sanitizeHtml('safe <script>alert(1)</script>text')
    expect(out).not.toContain('<script')
    expect(out).toContain('safe')
    expect(out).toContain('text')
  })

  it('removes inline event handlers from allowed tags', () => {
    const out = sanitizeHtml('<a href="https://example.com" onclick="alert(1)">click</a>')
    expect(out).toContain('href="https://example.com"')
    expect(out.toLowerCase()).not.toContain('onclick')
  })

  it('drops javascript: URLs but keeps the link text', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    // The unsafe href must not survive
    expect(out.toLowerCase()).not.toContain('javascript:')
    // Inner text should remain so the user does not lose data
    expect(out).toContain('x')
  })

  it('forces target=_blank and rel=noopener on safe links', () => {
    const out = sanitizeHtml('<a href="https://example.com">x</a>')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('keeps allowed formatting tags', () => {
    const out = sanitizeHtml('<p>hello <strong>world</strong></p>')
    expect(out).toContain('<p>')
    expect(out).toContain('<strong>')
  })

  it('unwraps disallowed tags but preserves their text content', () => {
    const out = sanitizeHtml('<iframe src="x">trapped</iframe>')
    expect(out).not.toContain('<iframe')
    expect(out).toContain('trapped')
  })

  it('handles deeply nested malicious content', () => {
    const out = sanitizeHtml('<div><span><img src=x onerror="alert(1)"></span></div>')
    expect(out.toLowerCase()).not.toContain('<img')
    expect(out.toLowerCase()).not.toContain('onerror')
  })
})
