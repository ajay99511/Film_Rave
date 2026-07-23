'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, friends, session } from '@/lib/client';

type State = 'unknown' | 'guest' | 'self' | 'ready' | 'sent' | 'friends' | 'error';

/**
 * Invite-landing actions. Server-rendered page passes the target's id/handle;
 * this client island resolves the viewer's session and sends the friend request.
 */
export function AddFriendActions({
  targetId,
  displayName,
}: {
  targetId: string;
  displayName: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>('unknown');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const me = session.user;
    if (!session.access) setState('guest');
    else if (me?.user_id === targetId) setState('self');
    else setState('ready');
  }, [targetId]);

  const send = async () => {
    try {
      await friends.request(targetId);
      setState('sent');
    } catch (e) {
      setState('error');
      setMessage(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  };

  if (state === 'unknown') return null;

  if (state === 'self') {
    return <p className="text-marquee-muted text-sm">This is your own invite link.</p>;
  }

  if (state === 'guest') {
    return (
      <button
        onClick={() => router.push('/login')}
        className="w-full rounded-full bg-marquee-amber px-6 py-3 font-medium text-black transition hover:opacity-90"
      >
        Sign in to add {displayName}
      </button>
    );
  }

  if (state === 'sent') {
    return (
      <div className="w-full rounded-full border border-marquee-teal px-6 py-3 text-center font-medium text-marquee-teal">
        Friend request sent ✓
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <button
        onClick={send}
        className="w-full rounded-full bg-marquee-amber px-6 py-3 font-medium text-black transition hover:opacity-90"
      >
        Add {displayName} as a friend
      </button>
      {state === 'error' && <p className="text-sm text-rose-400">{message}</p>}
      <button
        onClick={() => router.push('/app')}
        className="w-full rounded-full px-6 py-3 text-sm text-marquee-teal hover:underline"
      >
        Open FilmRave
      </button>
    </div>
  );
}
