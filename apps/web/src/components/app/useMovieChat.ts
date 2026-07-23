'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessageDto } from '@filmrave/shared';
import { chat } from '@/lib/client';

interface UseMovieChat {
  messages: ChatMessageDto[];
  send: (body: string) => void;
  connected: boolean;
}

/**
 * Loads a movie thread's history, then streams live messages. The transport is
 * backend-agnostic (`chat` from `@/lib/client`): Socket.IO over HTTP, or a
 * BroadcastChannel bus locally — this hook doesn't care which.
 */
export function useMovieChat(
  circleId: string,
  movieTmdbId: number,
): UseMovieChat {
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [connected, setConnected] = useState(false);
  const sendRef = useRef<((body: string) => void) | null>(null);

  useEffect(() => {
    let alive = true;
    setMessages([]);

    chat
      .history(circleId, movieTmdbId)
      .then((history) => alive && setMessages(history))
      .catch(() => {});

    const append = (m: ChatMessageDto) =>
      setMessages((prev) =>
        prev.some((x) => x.message_id === m.message_id) ? prev : [...prev, m],
      );

    const handle = chat.open(circleId, movieTmdbId, {
      onMessage: append,
      onStatus: (c) => alive && setConnected(c),
    });
    sendRef.current = handle.send;

    return () => {
      alive = false;
      handle.close();
      sendRef.current = null;
    };
  }, [circleId, movieTmdbId]);

  const send = (body: string) => sendRef.current?.(body);

  return { messages, send, connected };
}
