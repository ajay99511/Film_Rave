'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Search, Clapperboard } from 'lucide-react';
import type { MovieDto } from '@filmrave/shared';
import { ApiError, circles, movies } from '@/lib/client';

/**
 * Log a co-watched movie: searches the TMDB catalog (via the API), then records
 * a group watch. When TMDB isn't configured locally the search reports it
 * plainly rather than failing silently.
 */
export function LogMovieModal({
  circleId,
  onClose,
  onLogged,
}: {
  circleId: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MovieDto[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    setNote(null);
    try {
      setResults(await movies.search(query.trim()));
    } catch (err) {
      setResults([]);
      setNote(
        err instanceof ApiError && err.status === 503
          ? 'Movie search needs a TMDB API key (set TMDB_API_KEY in apps/api/.env).'
          : 'Search failed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const log = async (m: MovieDto) => {
    if (m.tmdb_id == null) return;
    setBusy(true);
    try {
      await circles.addGroupWatch(circleId, m.tmdb_id);
      onLogged();
      onClose();
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
        className="relative w-full max-w-lg bg-white dark:bg-[#1A1A1D] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-indigo-500" /> Log Co-Watched Movie
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={search} className="p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a movie…"
              className="w-full bg-slate-50 dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </form>
        <div className="flex-1 overflow-y-auto p-2">
          {note && <p className="p-4 text-sm text-amber-500">{note}</p>}
          {busy && <p className="p-4 text-sm text-slate-500">Working…</p>}
          {results.map((m) => (
            <button
              key={m.tmdb_id}
              onClick={() => log(m)}
              className="w-full flex items-center gap-4 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors text-left"
            >
              {m.poster_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.poster_url} alt={m.title} className="w-12 h-16 object-cover rounded-md" />
              ) : (
                <div className="w-12 h-16 rounded-md bg-slate-200 dark:bg-slate-800" />
              )}
              <div>
                <h3 className="font-bold">{m.title}</h3>
                <p className="text-xs text-slate-500">{m.year ?? m.release_date}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
