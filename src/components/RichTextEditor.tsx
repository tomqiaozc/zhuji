import { useEffect, useRef } from 'react'
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

  function btn(label: string, cmd: string, arg?: string, title?: string) {
    return (
      <button
        type="button"
        title={title ?? label}
        onMouseDown={(e) => {
          e.preventDefault()
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
              exec('createLink', url)
              commitNow()
            }
          }}
        >
          🔗
        </button>
        {btn('清除', 'removeFormat', undefined, '清除格式')}
      </div>
      <div
        ref={ref}
        className="rt-editor"
        contentEditable
        suppressContentEditableWarning
        onInput={scheduleCommit}
        onBlur={commitNow}
        data-placeholder={placeholder}
      />
    </div>
  )
}
