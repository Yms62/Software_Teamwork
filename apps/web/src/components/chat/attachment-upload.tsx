import { Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  deleteSessionAttachment,
  getSessionAttachment,
  uploadSessionAttachment,
} from '@/api/conversations'
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
  onCleanup?: (uploadSessionId: string) => void,
) {
  const [state, setState] = useState<UploadStateData>({ phase: 'idle' })
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Per-upload token — incremented on each new upload or dismiss so stale async
   *  callbacks cannot overwrite the current upload's state. */
  const uploadTokenRef = useRef(0)
  /** AbortController for the in-flight upload request. */
  const abortRef = useRef<AbortController | null>(null)
  /** Real attachment ID returned by the upload API, so we can delete it on cancel. */
  const realAttachmentIdRef = useRef<string | null>(null)
  /** sessionId captured at upload-start time so cleanup always targets the right session. */
  const uploadSessionIdRef = useRef<string | null>(null)

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const startPoll = useCallback(
    (attachment: SessionAttachmentSummary, attemptsSoFar: number, token: number) => {
      // Stale upload — a newer upload or dismiss already started
      if (token !== uploadTokenRef.current) return
      if (attemptsSoFar >= MAX_POLL_ATTEMPTS) {
        if (token !== uploadTokenRef.current) return
        setState({
          phase: 'error',
          filename: attachment.filename,
          message: '解析超时，请稍后重试',
        })
        realAttachmentIdRef.current = null
        onCleanup?.(uploadSessionIdRef.current!)
        return
      }

      if (token !== uploadTokenRef.current) return
      setState({ phase: 'polling', attachment, attempts: attemptsSoFar })

      const poll = async () => {
        try {
          const updated = await getSessionAttachment(attachment.sessionId, attachment.id)
          if (token !== uploadTokenRef.current) return

          if (updated.status === 'ready') {
            setState({ phase: 'done', attachment: updated })
            onAttachmentReady(updated)
            // Attachment is now committed to the session list — clear the ref
            // so a subsequent upload won't delete it as "previous upload".
            realAttachmentIdRef.current = null
          } else if (updated.status === 'failed' || updated.status === 'purged') {
            setState({
              phase: 'error',
              filename: attachment.filename,
              message: updated.errorMessage ?? '文件解析失败',
            })
            realAttachmentIdRef.current = null
            onCleanup?.(uploadSessionIdRef.current!)
          } else {
            pollTimerRef.current = setTimeout(() => {
              startPoll(updated, attemptsSoFar + 1, token)
            }, POLL_INTERVAL_MS)
          }
        } catch {
          if (token !== uploadTokenRef.current) return
          pollTimerRef.current = setTimeout(() => {
            startPoll(attachment, attemptsSoFar + 1, token)
          }, POLL_INTERVAL_MS)
        }
      }

      poll()
    },
    [onAttachmentReady, onCleanup],
  )

  const uploadFile = useCallback(
    async (file: File) => {
      if (!sessionId) return

      // Clean up the previous upload's real attachment (if any) so it doesn't
      // become an orphan consuming quota on the backend.
      const prevSid = uploadSessionIdRef.current
      const prevRealId = realAttachmentIdRef.current
      if (prevSid && prevRealId) {
        deleteSessionAttachment(prevSid, prevRealId).catch(() => {
          // Fire-and-forget — server may have already purged it
        })
      }

      const token = ++uploadTokenRef.current
      uploadSessionIdRef.current = sessionId
      realAttachmentIdRef.current = null

      // Cancel any previous in-flight request
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState({ phase: 'uploading', filename: file.name })

      try {
        const attachment = await uploadSessionAttachment(sessionId, file, controller.signal)
        if (token !== uploadTokenRef.current) return
        realAttachmentIdRef.current = attachment.id
        startPoll(attachment, 0, token)
      } catch (err: unknown) {
        if (token !== uploadTokenRef.current) return
        // Don't surface AbortError as a user-visible failure
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState({ phase: 'error', filename: file.name, message: '上传失败，请重试' })
        onCleanup?.(uploadSessionIdRef.current!)
      }
    },
    [sessionId, startPoll, onCleanup],
  )

  const dismissUpload = useCallback(() => {
    const sid = uploadSessionIdRef.current
    const realId = realAttachmentIdRef.current
    uploadTokenRef.current++
    abortRef.current?.abort()
    abortRef.current = null
    clearPollTimer()
    setState({ phase: 'idle' })

    // If the upload already created a real attachment on the backend, delete it
    // so it won't reappear on next session load. Fire-and-forget.
    if (sid && realId) {
      deleteSessionAttachment(sid, realId).catch(() => {
        // Silently ignore — server may not have persisted it yet
      })
    }
    realAttachmentIdRef.current = null

    onCleanup?.(sid!)
  }, [clearPollTimer, onCleanup])

  useEffect(() => {
    // Capture ref objects (not .current) so the cleanup closure reads the
    // latest value at unmount time, not the stale value at mount time.
    const tokenRef = uploadTokenRef
    const ctrlRef = abortRef
    const sessionRef = uploadSessionIdRef
    const realIdRef = realAttachmentIdRef
    return () => {
      tokenRef.current++
      ctrlRef.current?.abort()
      ctrlRef.current = null

      const sid = sessionRef.current
      const realId = realIdRef.current
      if (sid && realId) {
        deleteSessionAttachment(sid, realId).catch(() => {
          // Fire-and-forget — server may not have persisted it yet
        })
        realIdRef.current = null
      }

      clearPollTimer()
    }
  }, [clearPollTimer])

  return { uploadState: state, uploadFile, dismissUpload }
}
