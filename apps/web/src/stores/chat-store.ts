/**
 * Chat UI state — sessions metadata, per-session messages, streaming flag, error tracking.
 *
 * QASession does NOT embed messages — they are stored separately in `messagesBySession`.
 * Only session IDs are persisted to localStorage so the sidebar can
 * restore the session list across page reloads.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { QAMessage, QASession, SessionAttachmentSummary } from '@/lib/types'

export interface ChatState {
  /** Full session metadata objects (in-memory, fetched from server or created locally). */
  sessions: QASession[]
  /** Session IDs persisted to localStorage for session recovery. */
  sessionIds: string[]
  /** Currently selected session. */
  activeId: string | null
  /** Whether an SSE stream is in progress. */
  streaming: boolean
  /** Last fatal error message for display. */
  error: string | null
  /** The user message that triggered a fatal error (for retry). */
  lastFailedMsg: string | null
  /** Messages keyed by sessionId (QASession does not embed messages). */
  messagesBySession: Record<string, QAMessage[]>
  /** Attachments keyed by sessionId. */
  attachmentsBySession: Record<string, SessionAttachmentSummary[]>
  /** Attachment IDs excluded from the next message send, keyed by sessionId. */
  excludedAttachmentIds: Record<string, string[]>

  // ── Actions ──

  /** Bulk-set session metadata (used when syncing from server). */
  setSessions: (sessions: QASession[]) => void
  setSessionIds: (ids: string[]) => void
  setActiveId: (id: string | null) => void
  /** Prepend a new session metadata, deduping by sessionId. Also updates persisted sessionIds. */
  addSession: (session: QASession) => void
  /** Remove a session, its messages, and its persisted id. Clears activeId if it matches. */
  removeSession: (sessionId: string) => void
  /** Replace the messages array for a given session. */
  updateSessionMessages: (sessionId: string, messages: QAMessage[]) => void
  /** Prepend a new message to a session's message list. */
  appendSessionMessages: (sessionId: string, messages: QAMessage[]) => void
  setStreaming: (streaming: boolean) => void
  setError: (error: string | null) => void
  setLastFailedMsg: (msg: string | null) => void
  clearError: () => void
  /** Replace all attachments for a session. */
  setSessionAttachments: (sessionId: string, attachments: SessionAttachmentSummary[]) => void
  /** Add a single attachment to a session (deduped by id). */
  addAttachment: (sessionId: string, attachment: SessionAttachmentSummary) => void
  /** Patch a single attachment by id. */
  updateAttachment: (
    sessionId: string,
    attachmentId: string,
    patch: Partial<SessionAttachmentSummary>,
  ) => void
  /** Remove a single attachment by id. */
  removeAttachment: (sessionId: string, attachmentId: string) => void
  /** Set excluded attachment IDs for a session. */
  setExcludedAttachmentIds: (sessionId: string, ids: string[]) => void
  /** Toggle an attachment's inclusion state for the next send. */
  toggleAttachmentExcluded: (sessionId: string, attachmentId: string) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      sessions: [],
      sessionIds: [],
      activeId: null,
      streaming: false,
      error: null,
      lastFailedMsg: null,
      messagesBySession: {},
      attachmentsBySession: {},
      excludedAttachmentIds: {},

      setSessions: (sessions) => set({ sessions }),

      setSessionIds: (ids) => set({ sessionIds: ids }),

      setActiveId: (id) => set({ activeId: id }),

      addSession: (session) =>
        set((state) => {
          if (state.sessions.some((s) => s.id === session.id)) {
            return state
          }
          return {
            sessions: [session, ...state.sessions],
            sessionIds: [session.id, ...state.sessionIds.filter((sid) => sid !== session.id)],
          }
        }),

      removeSession: (sessionId) =>
        set((state) => {
          const { [sessionId]: _removedMessages, ...restMessages } = state.messagesBySession
          const { [sessionId]: _removedAttachments, ...restAttachments } =
            state.attachmentsBySession
          const { [sessionId]: _removedExcluded, ...restExcluded } = state.excludedAttachmentIds
          return {
            sessions: state.sessions.filter((s) => s.id !== sessionId),
            sessionIds: state.sessionIds.filter((sid) => sid !== sessionId),
            activeId: state.activeId === sessionId ? null : state.activeId,
            messagesBySession: restMessages,
            attachmentsBySession: restAttachments,
            excludedAttachmentIds: restExcluded,
          }
        }),

      updateSessionMessages: (sessionId, messages) =>
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [sessionId]: messages,
          },
        })),

      appendSessionMessages: (sessionId, messages) =>
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [sessionId]: [...(state.messagesBySession[sessionId] ?? []), ...messages],
          },
        })),

      setStreaming: (streaming) => set({ streaming }),

      setError: (error) => set({ error }),

      setLastFailedMsg: (msg) => set({ lastFailedMsg: msg }),

      clearError: () => set({ error: null, lastFailedMsg: null }),

      setSessionAttachments: (sessionId, attachments) =>
        set((state) => ({
          attachmentsBySession: {
            ...state.attachmentsBySession,
            [sessionId]: attachments,
          },
        })),

      addAttachment: (sessionId, attachment) =>
        set((state) => {
          const existing = state.attachmentsBySession[sessionId] ?? []
          if (existing.some((a) => a.id === attachment.id)) return state
          return {
            attachmentsBySession: {
              ...state.attachmentsBySession,
              [sessionId]: [attachment, ...existing],
            },
          }
        }),

      updateAttachment: (sessionId, attachmentId, patch) =>
        set((state) => {
          const existing = state.attachmentsBySession[sessionId]
          if (!existing) return state
          return {
            attachmentsBySession: {
              ...state.attachmentsBySession,
              [sessionId]: existing.map((a) => (a.id === attachmentId ? { ...a, ...patch } : a)),
            },
          }
        }),

      removeAttachment: (sessionId, attachmentId) =>
        set((state) => {
          const existing = state.attachmentsBySession[sessionId]
          if (!existing) return state
          return {
            attachmentsBySession: {
              ...state.attachmentsBySession,
              [sessionId]: existing.filter((a) => a.id !== attachmentId),
            },
            excludedAttachmentIds: {
              ...state.excludedAttachmentIds,
              [sessionId]: (state.excludedAttachmentIds[sessionId] ?? []).filter(
                (id) => id !== attachmentId,
              ),
            },
          }
        }),

      setExcludedAttachmentIds: (sessionId, ids) =>
        set((state) => ({
          excludedAttachmentIds: {
            ...state.excludedAttachmentIds,
            [sessionId]: ids,
          },
        })),

      toggleAttachmentExcluded: (sessionId, attachmentId) =>
        set((state) => {
          const current = state.excludedAttachmentIds[sessionId] ?? []
          const isExcluded = current.includes(attachmentId)
          return {
            excludedAttachmentIds: {
              ...state.excludedAttachmentIds,
              [sessionId]: isExcluded
                ? current.filter((id) => id !== attachmentId)
                : [...current, attachmentId],
            },
          }
        }),
    }),
    {
      name: 'qa-sessions-ids',
      partialize: (state) => ({ sessionIds: state.sessionIds }),
    },
  ),
)
