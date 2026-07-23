/**
 * Local realtime transport — the stand-in for the Socket.IO chat gateway. New
 * messages are fanned out to every open tab via BroadcastChannel (with a
 * localStorage-event fallback for older engines) plus an in-tab listener set, so
 * a message sent in one tab appears live in another exactly as the WS gateway
 * would deliver it.
 */
import type { ChatMessageDto } from '@filmrave/shared';

type Listener = (message: ChatMessageDto) => void;

const CHANNEL = 'filmrave.chat';
const isBrowser = typeof window !== 'undefined';

const listeners = new Set<Listener>();

const channel: BroadcastChannel | null =
  isBrowser && 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;

if (channel) {
  channel.onmessage = (e: MessageEvent<ChatMessageDto>) => emitLocal(e.data);
} else if (isBrowser) {
  window.addEventListener('storage', (e) => {
    if (e.key === CHANNEL && e.newValue) {
      try {
        emitLocal(JSON.parse(e.newValue) as ChatMessageDto);
      } catch {
        /* ignore malformed cross-tab payloads */
      }
    }
  });
}

function emitLocal(message: ChatMessageDto): void {
  for (const l of listeners) l(message);
}

/** Broadcast a persisted message to this tab and every other open tab. */
export function publishMessage(message: ChatMessageDto): void {
  emitLocal(message);
  if (channel) channel.postMessage(message);
  else if (isBrowser) {
    // Toggle a value so repeated identical messages still fire `storage`.
    localStorage.setItem(CHANNEL, JSON.stringify(message));
  }
}

export function subscribeMessages(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
