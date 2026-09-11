'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Send, Users } from 'lucide-react';
import type { CircleDto, MovieDto } from '@filmrave/shared';
import { ApiError, circles as circlesApi } from '@/lib/client';

/** Lets the user post a movie into one of their circles' feeds with an
 * optional note — the "share this to a circle" action from a browse/
 * watchlist screen, outside any single circle's context. */
export function ShareToCircleModal({
  movie,
  circles,
  onClose,
  onShared,
}: {
  movie: MovieDto;
  circles: CircleDto[];
  onClose: () => void;
  onShared: () => void;
}) {
  const [circleId, setCircleId] = useState(circles[0]?.group_id ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    if (!circleId || movie.tmdb_id == null) return;
    setBusy(true);
    setError(null);
    try {
      await circlesApi.shareMovie(circleId, movie.tmdb_id, message);
      onShared();
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
          <Send className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">
          Share &ldquo;{movie.title}&rdquo;
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Posts it into that circle&apos;s feed with a note, so everyone can chime in.
        </p>

        {circles.length === 0 ? (
          <p className="text-sm text-slate-500 mb-4">
            You&apos;re not in any circles yet — start one first.
          </p>
        ) : (
          <>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
              Circle
            </label>
            <div className="relative mb-4">
              <Users className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={circleId}
                onChange={(e) => setCircleId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-orange-500"
              >
                {circles.map((c) => (
                  <option key={c.group_id} value={c.group_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
              Note (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Why should the circle watch this?"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-orange-500 mb-4 resize-none"
            />
          </>
        )}

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
            onClick={() => void share()}
            disabled={busy || !circleId}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
          >
            {busy ? 'Sharing…' : 'Share'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
