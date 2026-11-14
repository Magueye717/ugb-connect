// Conversations on the backend, for every feature that has a chat (Sunu Taxi now, lost & found next).
import { api } from '@/lib/api';

export type ChatIdentity = { key: string; name: string; initials: string; role: string | null };

export type MessageDto = {
  id: string;
  conversationId: string;
  kind: 'text' | 'quick_reply' | 'system';
  body: string;
  author: ChatIdentity | null;
  clientMessageId: string | null;
  createdAt: string;
};

export type ConversationDto = {
  id: string;
  type: 'taxi_trip' | 'lost_claim' | 'housing_contact';
  contextRef: string;
  title: string;
  status: 'open' | 'closed';
  canWrite: boolean;
  writableUntil: string | null;
  me: ChatIdentity;
  members: ChatIdentity[];
  blockedKeys: string[];
  unread: number;
};

export type ConversationSummary = { id: string; type: ConversationDto['type']; contextRef: string; title: string; canWrite: boolean; unread: number; lastMessage: MessageDto | null };

const auth = { auth: true } as const;

export const chatApi = {
  list: () => api<{ items: ConversationSummary[] }>('GET', '/conversations', auth),
  get: (id: string) => api<ConversationDto>('GET', `/conversations/${id}`, auth),
  messages: (id: string, q: { before?: string; after?: string } = {}) => {
    const qs = q.after ? `?after=${q.after}` : q.before ? `?before=${q.before}` : '';
    return api<{ items: MessageDto[]; hasMore: boolean }>('GET', `/conversations/${id}/messages${qs}`, auth);
  },
  send: (id: string, body: { body: string; kind: 'text' | 'quick_reply'; clientMessageId: string }) =>
    api<MessageDto>('POST', `/conversations/${id}/messages`, { ...auth, body }),
  read: (id: string, lastReadMessageId: string) => api<void>('POST', `/conversations/${id}/read`, { ...auth, body: { lastReadMessageId } }),
  report: (id: string, messageId: string) => api<void>('POST', `/conversations/${id}/messages/${messageId}/report`, { ...auth, body: {} }),
  blockAuthor: (id: string, messageId: string) => api<void>('POST', `/conversations/${id}/messages/${messageId}/block-author`, auth),
};

/** Unique per message, so a send retried after a network error is posted once. */
export const newClientMessageId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
