import { CheckCircle, Eye, EyeOff, Loader2, Trash2, XCircle } from 'lucide-react'
import { useCallback } from 'react'

import { Badge } from '@/components/ui/badge'
import type { SessionAttachmentSummary } from '@/lib/types'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusBadge(status: SessionAttachmentSummary['status']) {
  switch (status) {
    case 'uploaded':
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-2.5 animate-spin" />
          处理中
        </Badge>
      )
    case 'parsing':
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="size-2.5 animate-spin" />
          解析中
        </Badge>
      )
    case 'ready':
      return (
        <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-600">
          <CheckCircle className="size-2.5" />
          可用
        </Badge>
      )
    case 'failed':
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="size-2.5" />
          失败
        </Badge>
      )
    case 'purged':
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          已过期
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

type AttachmentListProps = {
  attachments: SessionAttachmentSummary[]
  excludedIds: string[]
  onToggleExcluded: (attachmentId: string) => void
  onDelete: (sessionId: string, attachmentId: string) => void
  sessionId: string | null
}

export default function AttachmentList({
  attachments,
  excludedIds,
  onToggleExcluded,
  onDelete,
  sessionId,
}: AttachmentListProps) {
  // Only show non-purged attachments
  const visible = attachments.filter((a) => a.status !== 'purged')

  const handleDelete = useCallback(
    (id: string) => {
      if (!sessionId) return
      onDelete(sessionId, id)
    },
    [onDelete, sessionId],
  )

  if (!sessionId || visible.length === 0) return null

  return (
    <div className="space-y-1.5">
      {visible.map((att) => {
        const isExcluded = excludedIds.includes(att.id)
        const isReady = att.status === 'ready'

        return (
          <div
            key={att.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-shadow hover:shadow-sm"
          >
            {/* Status icon */}
            <div className="shrink-0">{statusBadge(att.status)}</div>

            {/* File info */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" title={att.filename}>
                {att.filename}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatFileSize(att.sizeBytes)}
                {att.errorMessage && (
                  <span className="ml-2 text-destructive">{att.errorMessage}</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-0.5">
              {isReady && (
                <button
                  type="button"
                  onClick={() => onToggleExcluded(att.id)}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title={isExcluded ? '包含此附件' : '排除此附件'}
                  aria-label={isExcluded ? '包含此附件' : '排除此附件'}
                >
                  {isExcluded ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(att.id)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="删除附件"
                aria-label={`删除 ${att.filename}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
