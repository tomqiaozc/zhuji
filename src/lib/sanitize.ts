// Lightweight whitelist sanitizer for the rich-text editor.
//
// We only allow a small set of formatting tags + safe links. Everything else
// is stripped (the tag is removed; in most cases inner text is preserved).
// Attribute handling: only `href` on <a>, restricted to http/https/mailto.
// `target` and `rel` are forced to safe values.
//
// This runs every time we read from / write to db.nodes.notes, and also when
// importing a backup. The DOM parser is sandboxed via DOMImplementation so
// nothing executes during parsing.

const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'UL',
  'OL',
  'LI',
  'H3',
  'P',
  'BR',
  'DIV',
  'SPAN',
])

const SAFE_URL = /^(https?:|mailto:)/i

function sanitizeNode(node: Node, out: Node, doc: Document) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(doc.createTextNode(child.textContent ?? ''))
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as Element
    const tag = el.tagName.toUpperCase()
    if (!ALLOWED_TAGS.has(tag)) {
      // unwrap — keep text, drop element
      const placeholder = doc.createDocumentFragment()
      sanitizeNode(el, placeholder, doc)
      out.appendChild(placeholder)
      continue
    }
    const clean = doc.createElement(tag.toLowerCase())
    if (tag === 'A') {
      const href = el.getAttribute('href') ?? ''
      if (SAFE_URL.test(href)) {
        clean.setAttribute('href', href)
        clean.setAttribute('target', '_blank')
        clean.setAttribute('rel', 'noopener noreferrer')
      }
    }
    sanitizeNode(el, clean, doc)
    out.appendChild(clean)
  }
}

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return ''
  // Parse in an inert document so scripts / event handlers don't fire.
  const doc = document.implementation.createHTMLDocument('')
  const wrap = doc.createElement('div')
  wrap.innerHTML = input
  const out = doc.createElement('div')
  sanitizeNode(wrap, out, doc)
  return out.innerHTML
}
