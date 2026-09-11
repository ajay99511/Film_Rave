'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { AtSign } from 'lucide-react';
import type { AppUserDto } from '@filmrave/shared';
import { ApiError, auth as authApi } from '@/lib/client';

export function EditHandleModal({
  currentHandle,
  onClose,
  onSaved,
}: {
  currentHandle: string;
  onClose: () => void;
  onSaved: (user: AppUserDto) => void;
}) {
  const [value, setValue] = useState(currentHandle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await authApi.updateHandle(value);
      onSaved(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-sm bg-white dark:bg-[#1A1A1D] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6"
      >
        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 mb-4">
          <AtSign className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">
          Edit your handle
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Used in your invite link (filmrave.app/add/@{value || 'handle'}). 3-20
          characters: lowercase letters, numbers, underscores.
        </p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          maxLength={20}
          autoFocus
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-orange-500 mb-4"
        />
        {error && <p className="text-sm text-rose-500 mb-4">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={busy || value.trim().length < 3}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
