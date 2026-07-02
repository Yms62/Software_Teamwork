/**
 * Chat SSE streaming + Knowledge query through public Gateway OpenAPI paths.
 */

import type {
  KnowledgeQueryRequest,
  KnowledgeQuerySummary,
  QAMessage,
  QASseEvent,
  QASseEventType,
} from '@/lib/types'

import { buildQuery, gatewayRequest, streamGateway } from './client'

export type ChatStreamError = {
  code?: string
  fatal?: boolean
  message: string
  requestId?: string
  seq: number
  status?: number
}

export type ChatAnswerDeltaData = Record<string, unknown> & {
  content: string
  seq: number
}

export interface ChatStreamHandlers {
  onMessageCreated?: (data: Record<string, unknown> & { seq: number }) => void
  onAgentIterationStarted?: (data: Record<string, unknown> & { seq: number }) => void
  onReasoningStep?: (data: Record<string, unknown> & { seq: number }) => void
  onToolStarted?: (data: Record<string, unknown> & { seq: number }) => void
  onToolCompleted?: (data: Record<string, unknown> & { seq: number }) => void
  onToolFailed?: (data: Record<string, unknown> & { seq: number }) => void
  onAnswerDelta?: (data: ChatAnswerDeltaData) => void
  onCitationDelta?: (data: Record<string, unknown> & { seq: number }) => void
  onAnswerCompleted?: (data: Record<string, unknown> & { seq: number }) => void
  onError?: (data: ChatStreamError) => void
  onDone?: () => void
  onAbort?: () => void
}

function dispatch(event: QASseEventType, data: unknown, handlers: ChatStreamHandlers): void {
  switch (event) {
    case 'message.created':
      handlers.onMessageCreated?.(data as Record<string, unknown> & { seq: number })
      break
    case 'agent.iteration.started':
      handlers.onAgentIterationStarted?.(data as Record<string, unknown> & { seq: number })
      break
    case 'reasoning.step':
      handlers.onReasoningStep?.(data as Record<string, unknown> & { seq: number })
      break
    case 'tool.started':
      handlers.onToolStarted?.(data as Record<string, unknown> & { seq: number })
      break
    case 'tool.completed':
      handlers.onToolCompleted?.(data as Record<string, unknown> & { seq: number })
      break
    case 'tool.failed':
      handlers.onToolFailed?.(data as Record<string, unknown> & { seq: number })
      break
    case 'answer.delta':
      handlers.onAnswerDelta?.(data as ChatAnswerDeltaData)
      break
    case 'citation.delta':
      handlers.onCitationDelta?.(data as Record<string, unknown> & { seq: number })
      break
    case 'answer.completed':
      handlers.onAnswerCompleted?.(data as Record<string, unknown> & { seq: number })
      break
    case 'error':
      handlers.onError?.(data as ChatStreamError)
      break
    default:
      break
  }
}

function parseSsePayload(
  data: string,
  fallbackSeq: number,
  sseId?: string,
): Record<string, unknown> & {
  seq: number
} {
  const raw = JSON.parse(data) as Record<string, unknown>
  const idSeq = sseId === undefined || sseId === '' ? undefined : Number(sseId)
  const seq =
    typeof idSeq === 'number' && Number.isFinite(idSeq)
      ? idSeq
      : typeof raw.eventSeq === 'number'
        ? raw.eventSeq
        : typeof raw.seq === 'number'
          ? raw.seq
          : fallbackSeq

  return { ...raw, seq }
}

function getAnswerDeltaContent(payload: Record<string, unknown>): string {
  if (typeof payload.content === 'string') return payload.content
  if (typeof payload.text === 'string') return payload.text
  return ''
}

function normalizeSsePayload(
  event: QASseEventType,
  payload: Record<string, unknown> & { seq: number },
): Record<string, unknown> & { seq: number } {
  if (event !== 'answer.delta') return payload
  return {
    ...payload,
    content: getAnswerDeltaContent(payload),
  }
}

export function streamChat(
  sessionId: string,
  message: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
  attachmentIds?: string[],
): { abort: () => void } {
  let fallbackSeq = 0
  let maxDispatchedSeq: number | undefined
  let didAbort = false
  let didReceiveAnswerCompleted = false
  let didReceiveFatalError = false

  const recordDispatchedSeq = (seq: number) => {
    maxDispatchedSeq = maxDispatchedSeq === undefined ? seq : Math.max(maxDispatchedSeq, seq)
  }

  const nextSyntheticSeq = () => {
    maxDispatchedSeq = maxDispatchedSeq === undefined ? 1 : maxDispatchedSeq + 1
    return maxDispatchedSeq
  }

  const isFatalErrorEvent = (
    event: QASseEventType,
    payload: Record<string, unknown> & { seq: number },
  ): boolean => {
    return event === 'error' && payload.fatal !== false
  }

  const body: Record<string, unknown> = { message }
  if (attachmentIds && attachmentIds.length > 0) {
    body.attachmentIds = attachmentIds
  }

  const stream = streamGateway(`/qa-sessions/${encodeURIComponent(sessionId)}/messages`, {
    body,
    method: 'POST',
    onError: (error) => {
      if (didAbort || didReceiveFatalError) return
      didReceiveFatalError = true
      handlers.onError?.({
        code: error.code,
        fatal: true,
        message: error.message,
        requestId: error.requestId,
        seq: nextSyntheticSeq(),
        status: error.status,
      })
    },
    onEvent: ({ data, event, id }) => {
      if (event === 'heartbeat') return
      if (didReceiveFatalError) return
      fallbackSeq += 1

      try {
        const qaEvent = event as QASseEventType
        const payload = normalizeSsePayload(qaEvent, parseSsePayload(data, fallbackSeq, id))
        const isStaleEvent = maxDispatchedSeq !== undefined && payload.seq <= maxDispatchedSeq
        if (isStaleEvent) return
        recordDispatchedSeq(payload.seq)
        if (qaEvent === 'answer.completed') {
          didReceiveAnswerCompleted = true
        }
        if (isFatalErrorEvent(qaEvent, payload)) {
          didReceiveFatalError = true
        }
        dispatch(qaEvent, payload, handlers)
      } catch {
        didReceiveFatalError = true
        stream.abort()
        handlers.onError?.({
          code: 'invalid_sse_event',
          fatal: true,
          message: '收到无法解析的 QA 流式事件',
          seq: nextSyntheticSeq(),
        })
      }
    },
    onDone: () => {
      if (didAbort || didReceiveFatalError) return
      if (didReceiveAnswerCompleted) {
        handlers.onDone?.()
      } else {
        didReceiveFatalError = true
        handlers.onError?.({
          code: 'stream_ended_without_completion',
          fatal: true,
          message: 'QA stream ended before answer.completed',
          seq: nextSyntheticSeq(),
        })
      }
    },
    signal,
  })

  return {
    abort: () => {
      didAbort = true
      stream.abort()
      handlers.onAbort?.()
    },
  }
}

export async function sendMessage(sessionId: string, message: string): Promise<QAMessage> {
  return gatewayRequest<QAMessage>(`/qa-sessions/${encodeURIComponent(sessionId)}/messages`, {
    body: { message },
    method: 'POST',
  })
}

export async function replayEvents(
  sessionId: string,
  responseRunId: string,
): Promise<QASseEvent[]> {
  return gatewayRequest<QASseEvent[]>(
    `/qa-sessions/${encodeURIComponent(sessionId)}/events${buildQuery({ responseRunId })}`,
  )
}

export async function queryKnowledge(
  params: KnowledgeQueryRequest,
): Promise<KnowledgeQuerySummary> {
  return gatewayRequest<KnowledgeQuerySummary>('/knowledge-queries', {
    body: params,
    method: 'POST',
  })
}
