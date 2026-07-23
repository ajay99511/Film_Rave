'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Users, Check } from 'lucide-react';
import type { AppUserDto, CircleDto } from '@filmrave/shared';
import { circles } from '@/lib/client';
import { Avatar } from './Avatar';

export function NewCircleModal({
  candidates,
  onClose,
  onCreated,
}: {
  candidates: AppUserDto[];
  onClose: () => void;
  onCreated: (c: CircleDto) => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const circle = await circles.create(name.trim(), '', selected);
      onCreated(circle);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md bg-white dark:bg-[#1A1A1D] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-500" /> Create New Circle
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Circle Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sci-Fi Sundays"
              className="w-full bg-slate-50 dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Invite Friends
            </label>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {candidates.length === 0 && (
                <p className="text-sm text-slate-500">Add friends first to invite them.</p>
              )}
              {candidates.map((u) => {
                const on = selected.includes(u.user_id);
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => toggle(u.user_id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors ${
                      on
                        ? 'bg-orange-50 dark:bg-orange-600/10 border-orange-200 dark:border-orange-600/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar user={u} size="sm" />
                      <span className="font-bold text-sm">{u.display_name}</span>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        on ? 'bg-orange-500 border-orange-500' : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {on && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors"
          >
            {busy ? 'Creating…' : 'Create Circle'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
