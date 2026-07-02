import { Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getSessionAttachment, uploadSessionAttachment } from '@/api/conversations'
import type { SessionAttachmentSummary } from '@/lib/types'

export type UploadStateData =
  | { phase: 'idle' }
  | { phase: 'uploading'; filename: string }
  | { phase: 'polling'; attachment: SessionAttachmentSummary; attempts: number }
  | { phase: 'done'; attachment: SessionAttachmentSummary }
  | { phase: 'error'; filename: string; message: string }

const MAX_POLL_ATTEMPTS = 30
const POLL_INTERVAL_MS = 2000

type AttachmentUploadStatusProps = {
  sessionId: string | null
  state: UploadStateData
  onDismiss: () => void
}

/**
 * Status display strip that shows attachment upload/polling/error progress.
 * Does NOT render its own file input or button — that lives in ChatInput.
 */
export default function AttachmentUploadStatus({
  sessionId: _sessionId,
  state,
  onDismiss,
}: AttachmentUploadStatusProps) {
  if (state.phase === 'idle' || state.phase === 'done') return null

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs">
      {state.phase === 'uploading' && (
        <>
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">上传中: {state.filename.slice(0, 20)}</span>
        </>
      )}
      {state.phase === 'polling' && (
        <>
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">
            解析中: {state.attachment.filename.slice(0, 20)}
          </span>
        </>
      )}
      {state.phase === 'error' && <span className="text-destructive">{state.message}</span>}
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 rounded-full p-0.5 hover:bg-muted"
        aria-label="取消"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

/**
 * React hook that manages the upload + polling lifecycle for a single file.
 *
 * Usage in ChatPage:
 *   const { uploadState, uploadFile, dismissUpload } = useAttachmentUpload(sessionId, onReady)
 *   <ChatInput onFileSelect={uploadFile} ... />
 *   <AttachmentUploadStatus sessionId={sessionId} state={uploadState} onDismiss={dismissUpload} />
 */
export function useAttachmentUpload(
  sessionId: string | null,
  onAttachmentReady: (attachment: SessionAttachmentSummary) => void,
  onCleanup?: () => void,
) {
  const [state, setState] = useState<UploadStateData>({ phase: 'idle' })
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortedRef = useRef(false)

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const startPoll = useCallback(
    (attachment: SessionAttachmentSummary, attemptsSoFar: number) => {
      if (abortedRef.current) return
      if (attemptsSoFar >= MAX_POLL_ATTEMPTS) {
        setState({
          phase: 'error',
          filename: attachment.filename,
          message: '解析超时，请稍后重试',
        })
        onCleanup?.()
        return
      }

      setState({ phase: 'polling', attachment, attempts: attemptsSoFar })

      const poll = async () => {
        try {
          const updated = await getSessionAttachment(attachment.sessionId, attachment.id)
          if (abortedRef.current) return

          if (updated.status === 'ready') {
            setState({ phase: 'done', attachment: updated })
            onAttachmentReady(updated)
          } else if (updated.status === 'failed' || updated.status === 'purged') {
            setState({
              phase: 'error',
              filename: attachment.filename,
              message: updated.errorMessage ?? '文件解析失败',
            })
            onCleanup?.()
          } else {
            pollTimerRef.current = setTimeout(() => {
              startPoll(updated, attemptsSoFar + 1)
            }, POLL_INTERVAL_MS)
          }
        } catch {
          if (!abortedRef.current) {
            pollTimerRef.current = setTimeout(() => {
              startPoll(attachment, attemptsSoFar + 1)
            }, POLL_INTERVAL_MS)
          }
        }
      }

      poll()
    },
    [onAttachmentReady],
  )

  const uploadFile = useCallback(
    async (file: File) => {
      if (!sessionId) return
      abortedRef.current = false
      setState({ phase: 'uploading', filename: file.name })

      try {
        const attachment = await uploadSessionAttachment(sessionId, file)
        if (abortedRef.current) return
        startPoll(attachment, 0)
      } catch {
        if (!abortedRef.current) {
          setState({ phase: 'error', filename: file.name, message: '上传失败，请重试' })
          onCleanup?.()
        }
      }
    },
    [sessionId, startPoll],
  )

  const dismissUpload = useCallback(() => {
    abortedRef.current = true
    clearPollTimer()
    setState({ phase: 'idle' })
    onCleanup?.()
  }, [clearPollTimer, onCleanup])

  useEffect(() => {
    return () => {
      abortedRef.current = true
      clearPollTimer()
    }
  }, [clearPollTimer])

  return { uploadState: state, uploadFile, dismissUpload }
}
