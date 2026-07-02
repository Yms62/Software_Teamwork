/**
 * QA Sessions CRUD — Gateway OpenAPI qa-sessions paths.
 *
 * Functions use gatewayRequest / gatewayPageRequest / requestVoid from ./client.
 * Types imported from @/lib/types (re-exported from generated/gateway).
 */

import type { QAMessage, QASession, QASessionStatus, SessionAttachmentSummary } from '@/lib/types'

import { buildQuery, gatewayPageRequest, gatewayRequest, requestVoid } from './client'

// ---------------------------------------------------------------------------
// POST /qa-sessions
// ---------------------------------------------------------------------------

export async function createSession(title?: string): Promise<QASession> {
  return gatewayRequest<QASession>('/qa-sessions', {
    method: 'POST',
    body: { title },
  })
}

// ---------------------------------------------------------------------------
// GET /qa-sessions?page=&pageSize=&status=&sort=-updatedAt
// ---------------------------------------------------------------------------

export interface ListSessionsParams {
  page?: number
  pageSize?: number
  status?: QASessionStatus
  sort?: string
}

export async function listSessions(
  params: ListSessionsParams = {},
): Promise<{ items: QASession[]; page: { page: number; pageSize: number; total: number } }> {
  return gatewayPageRequest<QASession>(
    `/qa-sessions${buildQuery({
      page: params.page,
      pageSize: params.pageSize,
      status: params.status,
      sort: params.sort ?? '-updatedAt',
    })}`,
  )
}

// ---------------------------------------------------------------------------
// GET /qa-sessions/{sessionId}
// ---------------------------------------------------------------------------

export async function getSession(sessionId: string): Promise<QASession> {
  return gatewayRequest<QASession>(`/qa-sessions/${encodeURIComponent(sessionId)}`)
}

// ---------------------------------------------------------------------------
// PATCH /qa-sessions/{sessionId}
// ---------------------------------------------------------------------------

export async function renameSession(sessionId: string, title: string): Promise<QASession> {
  return gatewayRequest<QASession>(`/qa-sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: { title },
  })
}

// ---------------------------------------------------------------------------
// PATCH /qa-sessions/{sessionId} — update title and/or status
// ---------------------------------------------------------------------------

export interface UpdateSessionParams {
  title?: string
  status?: QASessionStatus
}

export async function updateSession(
  sessionId: string,
  params: UpdateSessionParams,
): Promise<QASession> {
  return gatewayRequest<QASession>(`/qa-sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: params as Record<string, unknown>,
  })
}

// ---------------------------------------------------------------------------
// Convenience: archive a session (PATCH status=archived)
// ---------------------------------------------------------------------------

export async function archiveSession(sessionId: string): Promise<QASession> {
  return updateSession(sessionId, { status: 'archived' })
}

// ---------------------------------------------------------------------------
// DELETE /qa-sessions/{sessionId}
// ---------------------------------------------------------------------------

export async function deleteSession(sessionId: string): Promise<void> {
  await requestVoid(`/qa-sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// GET /qa-sessions/{sessionId}/messages?page=&pageSize=&includeThinking=&includeCitations=
// ---------------------------------------------------------------------------

export interface GetSessionMessagesParams {
  page?: number
  pageSize?: number
  includeThinking?: boolean
  includeCitations?: boolean
}

export async function getSessionMessages(
  sessionId: string,
  params: GetSessionMessagesParams = {},
): Promise<{ items: QAMessage[]; page: { page: number; pageSize: number; total: number } }> {
  return gatewayPageRequest<QAMessage>(
    `/qa-sessions/${encodeURIComponent(sessionId)}/messages${buildQuery({
      page: params.page,
      pageSize: params.pageSize,
      includeThinking: params.includeThinking,
      includeCitations: params.includeCitations,
    })}`,
  )
}

// ---------------------------------------------------------------------------
// GET /qa-sessions/{sessionId}/attachments?page=&pageSize=
// ---------------------------------------------------------------------------

export async function listSessionAttachments(
  sessionId: string,
  page?: number,
  pageSize?: number,
): Promise<{
  items: SessionAttachmentSummary[]
  page: { page: number; pageSize: number; total: number }
}> {
  return gatewayPageRequest<SessionAttachmentSummary>(
    `/qa-sessions/${encodeURIComponent(sessionId)}/attachments${buildQuery({
      page,
      pageSize,
    })}`,
  )
}

// ---------------------------------------------------------------------------
// POST /qa-sessions/{sessionId}/attachments (multipart/form-data)
// ---------------------------------------------------------------------------

export async function uploadSessionAttachment(
  sessionId: string,
  file: File,
  signal?: AbortSignal,
): Promise<SessionAttachmentSummary> {
  const formData = new FormData()
  formData.append('file', file)
  return gatewayRequest<SessionAttachmentSummary>(
    `/qa-sessions/${encodeURIComponent(sessionId)}/attachments`,
    { method: 'POST', body: formData, signal },
  )
}

// ---------------------------------------------------------------------------
// GET /qa-sessions/{sessionId}/attachments/{attachmentId}
// ---------------------------------------------------------------------------

export async function getSessionAttachment(
  sessionId: string,
  attachmentId: string,
): Promise<SessionAttachmentSummary> {
  return gatewayRequest<SessionAttachmentSummary>(
    `/qa-sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}`,
  )
}

// ---------------------------------------------------------------------------
// DELETE /qa-sessions/{sessionId}/attachments/{attachmentId}
// ---------------------------------------------------------------------------

export async function deleteSessionAttachment(
  sessionId: string,
  attachmentId: string,
): Promise<void> {
  // 204 No Content — use requestVoid which doesn't try to parse the response body
  await requestVoid(
    `/qa-sessions/${encodeURIComponent(sessionId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: 'DELETE' },
  )
}
