'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { motion } from 'motion/react';
import { Clapperboard } from 'lucide-react';
import { ApiError, DATA_SOURCE, auth, session } from '@/lib/client';

interface GoogleCredentialResponse {
  credential: string;
}
interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (res: GoogleCredentialResponse) => void;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const isDemo = DATA_SOURCE === 'local';

export default function LoginPage() {
  const router = useRouter();
  const btnRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gsiReady, setGsiReady] = useState(false);

  const enter = useCallback(() => router.replace('/app'), [router]);

  // Already signed in? Skip straight to the app.
  useEffect(() => {
    if (session.access && session.user) router.replace('/app');
  }, [router]);

  const signInWithToken = useCallback(
    async (idToken: string) => {
      setBusy(true);
      setError(null);
      try {
        const tokens = await auth.google(idToken);
        session.save(tokens);
        enter();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Sign-in failed. Please try again.');
        setBusy(false);
      }
    },
    [enter],
  );

  // Initialize Google Identity Services once its script has loaded (http mode).
  const initGoogle = useCallback(() => {
    if (isDemo || !window.google || !btnRef.current) return;
    if (!GOOGLE_CLIENT_ID) {
      setError('Google sign-in is not configured (NEXT_PUBLIC_GOOGLE_CLIENT_ID missing).');
      return;
    }
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (res) => void signInWithToken(res.credential),
    });
    window.google.accounts.id.renderButton(btnRef.current, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      width: 320,
    });
    setGsiReady(true);
  }, [signInWithToken]);

  useEffect(() => {
    if (!isDemo && window.google) initGoogle();
  }, [initGoogle]);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {!isDemo && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initGoogle} />
      )}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-orange-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center z-10"
      >
        <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(234,88,12,0.4)] mx-auto mb-8">
          <Clapperboard className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-black mb-4 tracking-tight">Film Rave</h1>
        <p className="text-slate-400 mb-10 text-lg">
          One door. Just you and the people whose taste you actually trust.
        </p>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl text-sm text-rose-300 mb-6">
            {error}
          </div>
        )}

        {isDemo ? (
          <button
            onClick={() => void signInWithToken('demo')}
            disabled={busy}
            className="w-full py-4 bg-white text-black font-bold rounded-2xl text-lg hover:bg-slate-200 transition-colors disabled:opacity-60"
          >
            {busy ? 'Entering…' : 'Continue as demo user'}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div ref={btnRef} className="flex justify-center min-h-[44px]" />
            {!gsiReady && !error && (
              <p className="text-slate-500 text-sm">Loading Google sign-in…</p>
            )}
            {busy && <p className="text-slate-400 text-sm">Signing you in…</p>}
          </div>
        )}

        <p className="text-slate-600 text-xs mt-8">
          {isDemo
            ? 'Demo mode — data lives in your browser. Set NEXT_PUBLIC_DATA_SOURCE=http for real Google sign-in.'
            : 'We only use your Google profile to create your FilmRave account.'}
        </p>
      </motion.div>
    </div>
  );
}
