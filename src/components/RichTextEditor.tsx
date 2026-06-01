import { useEffect, useRef, useState } from 'react'
import { sanitizeHtml } from '@/lib/sanitize'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

function exec(cmd: string, arg?: string) {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  document.execCommand(cmd, false, arg)
}

const DEBOUNCE_MS = 300
const UNDO_STACK_LIMIT = 50

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
  // Disable the "clear formatting" button unless the user has a non-empty
  // selection inside the editor; previously a stray click would wipe the
  // entire document. Tracked via a selectionchange listener so the button
  // updates as the caret moves.
  const [hasSelection, setHasSelection] = useState(false)
  // Undo history. Browsers have their own contentEditable undo, but
  // toolbar-driven edits (execCommand) and the custom "clear formatting"
  // path can break it; keep an explicit stack so Cmd/Ctrl-Z and the ↶
  // button always restore the last committed state.
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

  /**
   * Strip formatting from the current selection without `execCommand`.
   *
   * The legacy "清除" button used `document.execCommand('removeFormat', …)`,
   * which is deprecated and behaves inconsistently across engines. We
   * replicate the useful subset: collapse the current selection's HTML
   * down to its text content. If the user has no selection (caret only),
   * do nothing — a no-op is safer than wiping the whole field.
   */
  function clearSelectionFormat() {
    const el = ref.current
    if (!el) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    // Snapshot before we mutate so undo works.
    pushUndoSnapshot()
    const text = range.toString()
    range.deleteContents()
    if (text) {
      const node = document.createTextNode(text)
      range.insertNode(node)
      range.setStartAfter(node)
      range.setEndAfter(node)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    commitNow()
  }

  function btn(label: string, cmd: string, arg?: string, title?: string) {
    return (
      <button
        type="button"
        title={title ?? label}
        onMouseDown={(e) => {
          e.preventDefault()
          pushUndoSnapshot()
          exec(cmd, arg)
          // Toolbar-driven edits are discrete actions; commit immediately
          // so toolbar feedback (e.g. tab away, save) sees the new state.
          commitNow()
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
        {btn('B', 'bold', undefined, '粗体')}
        {btn('I', 'italic', undefined, '斜体')}
        {btn('U', 'underline', undefined, '下划线')}
        {btn('H', 'formatBlock', 'h3', '小标题')}
        {btn('•', 'insertUnorderedList', undefined, '无序列表')}
        {btn('1.', 'insertOrderedList', undefined, '有序列表')}
        <button
          type="button"
          title="插入链接"
          onMouseDown={(e) => {
            e.preventDefault()
            const url = prompt('链接 URL')
            if (url) {
              pushUndoSnapshot()
              exec('createLink', url)
              commitNow()
            }
          }}
        >
          🔗
        </button>
        <button
          type="button"
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
        <button
          type="button"
          title="撤销 (Ctrl/Cmd+Z)"
          onMouseDown={(e) => {
            e.preventDefault()
            undo()
          }}
        >
          ↶
        </button>
      </div>
      <div
        ref={ref}
        className="rt-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          pushUndoSnapshot()
          scheduleCommit()
        }}
        onKeyDown={onKeyDown}
        onBlur={commitNow}
        data-placeholder={placeholder}
      />
    </div>
  )
}
