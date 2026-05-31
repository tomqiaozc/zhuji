import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

function exec(cmd: string, arg?: string) {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  document.execCommand(cmd, false, arg)
}

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.innerHTML !== value) el.innerHTML = value
  }, [value])

  function handleInput() {
    const el = ref.current
    if (!el) return
    onChange(el.innerHTML)
  }

  function btn(label: string, cmd: string, arg?: string, title?: string) {
    return (
      <button
        type="button"
        title={title ?? label}
        onMouseDown={(e) => {
          e.preventDefault()
          exec(cmd, arg)
          handleInput()
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
              handleInput()
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
        onInput={handleInput}
        onBlur={handleInput}
        data-placeholder={placeholder}
      />
    </div>
  )
}
