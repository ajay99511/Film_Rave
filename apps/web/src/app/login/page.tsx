'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Clapperboard, Phone, Hash, User, ChevronRight } from 'lucide-react';
import { ApiError, auth, session } from '@/lib/client';

type Step = 'welcome' | 'phone' | 'code' | 'username';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [signupToken, setSignupToken] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = () => router.replace('/app');

  // Already signed in? Skip the flow and go straight to the app.
  useEffect(() => {
    if (session.access && session.user) router.replace('/app');
  }, [router]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await auth.requestOtp(phone.trim());
      setDevCode(res.dev_code ?? null);
      setStep('code');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await auth.verifyOtp(phone.trim(), code.trim());
      if (res.status === 'authenticated') {
        session.save(res);
        enter();
      } else {
        setSignupToken(res.signup_token);
        setStep('username');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const tokens = await auth.completeProfile(
        signupToken,
        username.trim().toLowerCase(),
        displayName.trim() || username.trim(),
      );
      session.save(tokens);
      enter();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create profile');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-orange-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none" />

      <AnimatePresence mode="wait">
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm text-center"
          >
            <div className="w-20 h-20 bg-orange-600 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(234,88,12,0.4)] mx-auto mb-8">
              <Clapperboard className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-black mb-4 tracking-tight">
              The Popcorn Cartel
            </h1>
            <p className="text-slate-400 mb-12 text-lg">
              One door. No passwords. Just you and the people whose taste you
              actually trust.
            </p>
            <button
              onClick={() => setStep('phone')}
              className="w-full py-4 bg-white text-black font-bold rounded-2xl text-lg hover:bg-slate-200 transition-colors"
            >
              Continue with my number
            </button>
          </motion.div>
        )}

        {step === 'phone' && (
          <motion.div
            key="phone"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-sm"
          >
            <h2 className="text-3xl font-black mb-2">What&apos;s your number?</h2>
            <p className="text-slate-400 mb-8">
              This is your only key. We don&apos;t do passwords.
            </p>
            <div className="relative mb-6">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500" />
              <input
                type="tel"
                autoFocus
                placeholder="+15550000001"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && phone.length >= 8 && sendCode()}
                className="w-full bg-[#1A1A1D] border border-slate-800 rounded-2xl py-4 pl-14 pr-4 text-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
              />
            </div>
            {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}
            <button
              onClick={sendCode}
              disabled={phone.trim().length < 8 || busy}
              className="w-full py-4 bg-orange-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-2xl text-lg transition-colors flex items-center justify-center gap-2"
            >
              {busy ? 'Sending…' : 'Send Code'} <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}

        {step === 'code' && (
          <motion.div
            key="code"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-sm"
          >
            <h2 className="text-3xl font-black mb-2">Enter the code</h2>
            <p className="text-slate-400 mb-2">Sent to {phone}</p>
            {devCode && (
              <p className="text-emerald-400 text-sm mb-6 font-mono">
                Dev code: {devCode}
              </p>
            )}
            <div className="relative mb-6">
              <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500" />
              <input
                type="text"
                autoFocus
                maxLength={6}
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && verify()}
                className="w-full bg-[#1A1A1D] border border-slate-800 rounded-2xl py-4 pl-14 pr-4 text-2xl tracking-[0.5em] text-center focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
              />
            </div>
            {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}
            <button
              onClick={verify}
              disabled={code.length < 6 || busy}
              className="w-full py-4 bg-white disabled:bg-slate-800 disabled:text-slate-500 text-black font-bold rounded-2xl text-lg transition-colors"
            >
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </motion.div>
        )}

        {step === 'username' && (
          <motion.div
            key="username"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-sm"
          >
            <h2 className="text-3xl font-black mb-2">Grab a username</h2>
            <p className="text-slate-400 mb-8">One handle across the whole place.</p>
            <div className="relative mb-4">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-500" />
              <input
                type="text"
                autoFocus
                placeholder="ajay_codes"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                }
                className="w-full bg-[#1A1A1D] border border-slate-800 rounded-2xl py-4 pl-14 pr-4 text-xl focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all lowercase"
              />
            </div>
            <input
              type="text"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-[#1A1A1D] border border-slate-800 rounded-2xl py-4 px-4 text-lg mb-6 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
            />
            {error && <p className="text-rose-400 text-sm mb-4">{error}</p>}
            <button
              onClick={claim}
              disabled={username.length < 3 || busy}
              className="w-full py-4 bg-white disabled:bg-slate-800 disabled:text-slate-500 text-black font-bold rounded-2xl text-lg transition-colors"
            >
              {busy ? 'Creating…' : `Claim @${username || 'handle'}`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
