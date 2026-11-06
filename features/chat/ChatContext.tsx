import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { chatApi, type ConversationSummary } from './api';
import { realtime } from './realtime';

type ChatsValue = {
  conversations: ConversationSummary[];
  /** New messages from others in a conversation (0 when unknown). */
  unreadFor: (conversationId: string | null | undefined) => number;
  /** The same, found by what the conversation is about (a lost-item claim's id, a trip's id). */
  unreadOf: (type: ConversationSummary['type'], contextRef: string | null | undefined) => number;
  /** The open chat screen read everything: clears its badge without waiting for the server. */
  markSeen: (conversationId: string) => void;
  refresh: () => Promise<void>;
};

const ChatsContext = createContext<ChatsValue | null>(null);

/**
 * Every conversation I'm in, whatever the feature, with unread counts for the badges. Kept fresh by my own
 * real-time channel ("something happened in one of your conversations"), and by the foreground/reconnect.
 * Also owns the app's WebSocket: open while signed in and in the foreground.
 */
export function ChatsProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      setConversations((await chatApi.list()).items);
    } catch {
      // Offline: badges keep their last value.
    }
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) {
      realtime.stop();
      setConversations([]);
      return;
    }
    realtime.start();
    refresh();
    // Several messages in a row: one refresh.
    const soon = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(refresh, 400);
    };
    const offMine = realtime.onMine((event) => event === 'conversation.activity' && soon());
    const offReconnect = realtime.onReconnect(refresh);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        realtime.start();
        refresh();
      } else if (s === 'background') realtime.stop();
    });
    return () => {
      offMine();
      offReconnect();
      sub.remove();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [signedIn, refresh]);

  const value = useMemo<ChatsValue>(
    () => ({
      conversations,
      unreadFor: (id) => (id ? (conversations.find((c) => c.id === id)?.unread ?? 0) : 0),
      unreadOf: (type, ref) => (ref ? (conversations.find((c) => c.type === type && c.contextRef === ref)?.unread ?? 0) : 0),
      markSeen: (id) => setConversations((cs) => cs.map((c) => (c.id === id && c.unread ? { ...c, unread: 0 } : c))),
      refresh,
    }),
    [conversations, refresh],
  );

  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>;
}

export function useChats() {
  const ctx = useContext(ChatsContext);
  if (!ctx) throw new Error('useChats must be used inside ChatsProvider');
  return ctx;
}
