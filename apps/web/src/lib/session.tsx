'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { AppUserDto } from '@filmrave/shared';
import { auth, session } from './client';

interface SessionCtx {
  user: AppUserDto | null;
  ready: boolean;
  setUser: (u: AppUserDto) => void;
  signOut: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AppUserDto | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Restore from storage, then confirm with the server (also refreshes user).
    const cached = session.user;
    if (cached) setUserState(cached);
    if (session.access || session.refresh) {
      auth
        .me()
        .then((u) => {
          session.setUser(u);
          setUserState(u);
        })
        .catch(() => {
          session.clear();
          setUserState(null);
        })
        .finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  const setUser = useCallback((u: AppUserDto) => {
    session.setUser(u);
    setUserState(u);
  }, []);

  const signOut = useCallback(() => {
    session.clear();
    setUserState(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, ready, setUser, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

/** Redirects to /login once we know there is no authenticated user. */
export function useRequireAuth(): SessionCtx {
  const ctx = useSession();
  const router = useRouter();
  useEffect(() => {
    if (ctx.ready && !ctx.user) router.replace('/login');
  }, [ctx.ready, ctx.user, router]);
  return ctx;
}
