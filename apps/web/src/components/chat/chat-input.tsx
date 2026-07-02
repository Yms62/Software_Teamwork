import { Paperclip, Send } from 'lucide-react'
import { type ChangeEvent, type KeyboardEvent, useCallback, useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type ChatInputProps = {
  onSend: (text: string) => void
  disabled: boolean
  value: string
  onChange: (value: string) => void
  size?: 'normal' | 'large'
  className?: string
  /** Called when a file is selected via the attachment button. */
  onFileSelect?: (file: File) => void
  /** Number of ready attachments to show as badge. */
  attachmentCount?: number
  /** Whether the attachment button should be disabled (e.g., no session). */
  disableAttach?: boolean
  /** Called when file validation fails (size or type). */
  onAttachError?: (message: string) => void
}

export default function ChatInput({
  onSend,
  disabled,
  value,
  onChange,
  size = 'normal',
  className,
  onFileSelect,
  attachmentCount = 0,
  disableAttach = false,
  onAttachError,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-resize on text change
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    onChange('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend, onChange])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      // Reset so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      // Validate against Gateway contract: max 20 MB, allowed MIME types.
      // Must match the multipart Content-Type allowlist in the generated Gateway
      // contract (UploadSessionAttachmentRequest). Expand here only after the
      // OpenAPI schema and generated types are updated.
      const ALLOWED_TYPES = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ]
      // Map file extensions to MIME types when the browser returns an empty type
      const EXT_MIME: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.txt': 'text/plain',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }
      if (file.size > 20 * 1024 * 1024) {
        onAttachError?.('文件大小不能超过 20MB')
        return
      }
      const effectiveType =
        file.type !== ''
          ? file.type
          : (EXT_MIME[file.name.slice(file.name.lastIndexOf('.')).toLowerCase()] ?? '')
      if (!ALLOWED_TYPES.includes(effectiveType)) {
        onAttachError?.('不支持的文件类型，仅支持 PDF、PNG、JPEG、TXT、DOCX')
        return
      }
      // If the browser reported an empty MIME, construct a new File with the
      // inferred type so the Gateway multipart Content-Type check passes
      const fileToUpload =
        file.type !== '' ? file : new File([file], file.name, { type: effectiveType })
      onFileSelect?.(fileToUpload)
    },
    [onFileSelect, onAttachError],
  )

  const canSend = value.trim().length > 0 && !disabled
  const attachDisabled = disableAttach || disabled

  const isLarge = size === 'large'

  return (
    <div
      className={cn(
        isLarge
          ? 'rounded-2xl border border-border/50 bg-card shadow-[0_4px_24px_-2px_rgba(0,0,0,0.10),0_1px_4px_-1px_rgba(0,0,0,0.05)] px-5 py-4 focus-within:border-primary/50 focus-within:shadow-[0_4px_24px_-2px_rgba(0,0,0,0.14),0_1px_4px_-1px_rgba(0,0,0,0.07)] focus-within:ring-2 focus-within:ring-primary/10'
          : 'rounded-xl border border-border/40 bg-card shadow-[0_2px_12px_-1px_rgba(0,0,0,0.07),0_1px_3px_-1px_rgba(0,0,0,0.04)] px-4 py-3 focus-within:border-primary/40 focus-within:shadow-[0_2px_12px_-1px_rgba(0,0,0,0.10),0_1px_3px_-1px_rgba(0,0,0,0.06)] focus-within:ring-2 focus-within:ring-primary/10',
        'shrink-0',
        className,
      )}
    >
      {/* Hidden file input for attachments */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.txt,.docx"
        className="hidden"
        onChange={handleFileChange}
        aria-label="选择附件文件"
      />

      <div className="flex items-end gap-2">
        {/* Attachment button */}
        {onFileSelect && (
          <button
            type="button"
            onClick={handleAttachClick}
            disabled={attachDisabled}
            className="relative shrink-0 self-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="添加附件"
            title={disableAttach ? '请先创建对话' : '添加附件'}
          >
            <Paperclip className="size-4" />
            {attachmentCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
                {attachmentCount > 9 ? '9+' : attachmentCount}
              </span>
            )}
          </button>
        )}

        <Textarea
          ref={textareaRef}
          className={cn(
            'min-h-0 flex-1 resize-none border-0 bg-transparent p-0 placeholder:text-muted-foreground focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm',
            isLarge ? 'py-2 text-lg' : 'py-1 text-base',
          )}
          placeholder={
            isLarge ? '输入问题，Enter 发送…' : '输入您的问题… (Enter 发送，Shift+Enter 换行)'
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!canSend}
          className="shrink-0 rounded-full bg-primary text-primary-foreground transition-all duration-200 hover:bg-primary/90 hover:scale-110 hover:shadow-md active:scale-90"
          aria-label="发送消息"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
