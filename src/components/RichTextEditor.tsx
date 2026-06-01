import { useEffect, useRef, useState } from 'react'
import { sanitizeHtml } from '@/lib/sanitize'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

const DEBOUNCE_MS = 300
const UNDO_STACK_LIMIT = 50

// Block-level tags we recognise as the "current paragraph" container
// for formatBlock / list conversion. DIV/P appear in the editor's own
// output; H1-H4 / LI for content that already has structure.
const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI'])

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Last value we either pushed up via onChange or accepted from props. We
  // compare against this to skip no-op writes (every keystroke would
  // otherwise fire onChange) AND to detect when an incoming `value` prop
  // is just the echo of what we just sent — that lets us avoid clobbering
  // the caret while the user is mid-edit. Initialised to `null` so the
  // first sync effect ALWAYS seeds the DOM with the incoming value, even
  // when that value happens to equal an empty editor's innerHTML.
  const lastCommittedRef = useRef<string | null>(null)
  const timerRef = useRef<number | null>(null)
  // Disable the "清除选中格式" button unless the user has a non-empty
  // selection inside the editor; previously a stray click would wipe the
  // entire document. Tracked via a selectionchange listener so the button
  // updates as the caret moves.
  const [hasSelection, setHasSelection] = useState(false)
  // Undo history. Browsers' built-in contentEditable undo gets broken
  // by any direct DOM mutation (toolbar buttons, our "清除" path), so
  // we maintain an explicit stack covering both typing and toolbar
  // edits. Snapshots are PRE-mutation innerHTML — pushed in the
  // beforeinput listener for typing, and pushed manually before each
  // toolbar mutation.
  const undoStackRef = useRef<string[]>([])

  // Sync external value changes into the DOM, but not when the change is
  // just our own debounced commit coming back through the parent's state.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const safe = sanitizeHtml(value)
    if (lastCommittedRef.current !== null && safe === lastCommittedRef.current) return
    if (el.innerHTML !== safe) el.innerHTML = safe
    lastCommittedRef.current = safe
  }, [value])

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  useEffect(() => {
    function recompute() {
      const sel = window.getSelection()
      const el = ref.current
      if (!sel || !el || sel.isCollapsed || sel.rangeCount === 0) {
        setHasSelection(false)
        return
      }
      const range = sel.getRangeAt(0)
      // Make sure the selection actually lives inside this editor.
      if (!el.contains(range.commonAncestorContainer)) {
        setHasSelection(false)
        return
      }
      setHasSelection(range.toString().length > 0)
    }
    document.addEventListener('selectionchange', recompute)
    return () => document.removeEventListener('selectionchange', recompute)
  }, [])

  // Capture the editor state BEFORE the browser applies a typing /
  // composition / paste mutation. React's synthetic onBeforeInput
  // doesn't reliably forward the native event on all engines, so
  // attach a native listener directly.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = () => {
      pushUndoSnapshot()
    }
    el.addEventListener('beforeinput', handler)
    return () => el.removeEventListener('beforeinput', handler)
  }, [])

  function pushUndoSnapshot() {
    const el = ref.current
    if (!el) return
    const snap = el.innerHTML
    const stack = undoStackRef.current
    if (stack.length && stack[stack.length - 1] === snap) return
    stack.push(snap)
    if (stack.length > UNDO_STACK_LIMIT) stack.shift()
  }

  function commitNow() {
    const el = ref.current
    if (!el) return
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const next = sanitizeHtml(el.innerHTML)
    if (next === lastCommittedRef.current) return
    lastCommittedRef.current = next
    onChange(next)
  }

  function scheduleCommit() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      commitNow()
    }, DEBOUNCE_MS)
  }

  function undo() {
    const el = ref.current
    if (!el) return
    const stack = undoStackRef.current
    const prev = stack.pop()
    if (prev === undefined) return
    el.innerHTML = prev
    commitNow()
  }

  // ── Selection helpers ───────────────────────────────────────────

  function selectionInsideEditor(): Range | null {
    const el = ref.current
    if (!el) return null
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    // Make sure the caret/selection is actually inside this editor;
    // otherwise toolbar clicks would mutate whatever else holds focus.
    if (!el.contains(range.commonAncestorContainer)) return null
    return range
  }

  function restoreSelectionAround(node: Node) {
    const sel = window.getSelection()
    if (!sel) return
    const r = document.createRange()
    r.selectNodeContents(node)
    sel.removeAllRanges()
    sel.addRange(r)
  }

  /** Find the nearest block-level ancestor of `node` inside the editor. */
  function closestBlock(node: Node | null): Element | null {
    const editor = ref.current
    if (!editor) return null
    let cur: Node | null = node
    while (cur && cur !== editor) {
      if (cur.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((cur as Element).tagName)) {
        return cur as Element
      }
      cur = cur.parentNode
    }
    return null
  }

  // ── Toolbar actions (no execCommand) ────────────────────────────

  /**
   * Wrap the current selection in <tag>. No-op if the selection is
   * collapsed or lives outside the editor. Toggling-off is intentionally
   * NOT implemented here — the "清除" button covers that path.
   */
  function wrapInline(tag: 'b' | 'i' | 'u') {
    const range = selectionInsideEditor()
    if (!range || range.collapsed) return
    pushUndoSnapshot()
    const wrapper = document.createElement(tag)
    wrapper.appendChild(range.extractContents())
    range.insertNode(wrapper)
    restoreSelectionAround(wrapper)
    commitNow()
  }

  /**
   * Replace the block ancestor of the caret with `<newTag>`. If the
   * caret has no block ancestor (e.g. raw text directly inside the
   * editor div), wrap the selection in a new block instead.
   */
  function setBlockTag(newTag: 'h3' | 'p') {
    const range = selectionInsideEditor()
    if (!range) return
    pushUndoSnapshot()
    const block = closestBlock(range.startContainer)
    if (block && block !== ref.current) {
      const next = document.createElement(newTag)
      while (block.firstChild) next.appendChild(block.firstChild)
      block.replaceWith(next)
      restoreSelectionAround(next)
    } else {
      const wrapper = document.createElement(newTag)
      const contents = range.extractContents()
      if (contents.hasChildNodes()) {
        wrapper.appendChild(contents)
      } else {
        wrapper.appendChild(document.createElement('br'))
      }
      range.insertNode(wrapper)
      restoreSelectionAround(wrapper)
    }
    commitNow()
  }

  /**
   * Convert the current selection (or current block, if collapsed) to
   * a <ul>/<ol> with one <li> per line. Preserves the text but loses
   * inline formatting inside the selection — keeps the implementation
   * tight; users who need richer lists can build them by typing.
   */
  function makeList(tag: 'ul' | 'ol') {
    const range = selectionInsideEditor()
    if (!range) return
    pushUndoSnapshot()
    let lines: string[]
    if (range.collapsed) {
      const block = closestBlock(range.startContainer)
      const text = block ? (block.textContent ?? '') : ''
      lines = text.split('\n')
      if (block && block !== ref.current) {
        block.remove()
      }
    } else {
      lines = range.toString().split('\n')
      range.deleteContents()
    }
    const list = document.createElement(tag)
    const items = lines.length > 0 ? lines : ['']
    for (const line of items) {
      const li = document.createElement('li')
      // Empty <li> still needs SOMETHING so the caret has a place to
      // land — a <br> placeholder is what Safari emits natively.
      if (line.length === 0) {
        li.appendChild(document.createElement('br'))
      } else {
        li.textContent = line
      }
      list.appendChild(li)
    }
    range.insertNode(list)
    restoreSelectionAround(list)
    commitNow()
  }

  /**
   * Wrap the current selection in <a href>. If nothing is selected,
   * insert a link whose visible text equals the URL. The sanitizer
   * runs at commit time and rejects non-http(s)/mailto schemes.
   */
  function insertLink(url: string) {
    const range = selectionInsideEditor()
    if (!range) return
    pushUndoSnapshot()
    const a = document.createElement('a')
    a.setAttribute('href', url)
    if (range.collapsed) {
      a.textContent = url
      range.insertNode(a)
    } else {
      a.appendChild(range.extractContents())
      range.insertNode(a)
    }
    restoreSelectionAround(a)
    commitNow()
  }

  /**
   * Strip formatting from the current selection without `execCommand`.
   * Collapses the selected fragment to its text content. No-op when
   * the selection is collapsed — safer than wiping the whole field.
   */
  function clearSelectionFormat() {
    const range = selectionInsideEditor()
    if (!range || range.collapsed) return
    pushUndoSnapshot()
    const text = range.toString()
    range.deleteContents()
    if (text) {
      const node = document.createTextNode(text)
      range.insertNode(node)
      range.setStartAfter(node)
      range.setEndAfter(node)
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
    commitNow()
  }

  function toolbarButton(
    label: string,
    onClick: () => void,
    title: string,
  ) {
    return (
      <button
        type="button"
        title={title}
        onMouseDown={(e) => {
          e.preventDefault()
          onClick()
        }}
      >
        {label}
      </button>
    )
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const mod = e.metaKey || e.ctrlKey
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      undo()
    }
  }

  return (
    <div>
      <div className="rt-toolbar">
        {toolbarButton('B', () => wrapInline('b'), '粗体')}
        {toolbarButton('I', () => wrapInline('i'), '斜体')}
        {toolbarButton('U', () => wrapInline('u'), '下划线')}
        {toolbarButton('H', () => setBlockTag('h3'), '小标题')}
        {toolbarButton('•', () => makeList('ul'), '无序列表')}
        {toolbarButton('1.', () => makeList('ol'), '有序列表')}
        {toolbarButton(
          '🔗',
          () => {
            const url = prompt('链接 URL')
            if (url) insertLink(url)
          },
          '插入链接',
        )}
        <button
          type="button"
          title={hasSelection ? '清除选中文本的格式' : '请先选中文字再清除格式'}
          disabled={!hasSelection}
          onMouseDown={(e) => {
            e.preventDefault()
            if (!hasSelection) return
            clearSelectionFormat()
          }}
        >
          清除选中格式
        </button>
        {toolbarButton('↶', undo, '撤销 (Ctrl/Cmd+Z)')}
      </div>
      <div
        ref={ref}
        className="rt-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={scheduleCommit}
        onKeyDown={onKeyDown}
        onBlur={commitNow}
        data-placeholder={placeholder}
      />
    </div>
  )
}
