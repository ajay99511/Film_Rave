'use client';

/**
 * TMDB browse surface — the "Database" view. Pulls popular/upcoming titles from
 * the real `movies.*` client (NestJS → TMDB in http mode, local catalog in demo
 * mode) and lets the user search, add to their watchlist, or quick-rate. It only
 * uses fields present on MovieDto, so it stays truthful to the wire contract.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  CalendarPlus,
  Film,
  RefreshCw,
  Search,
  Sparkles,
  Star,
} from 'lucide-react';
import type { MovieDto } from '@filmrave/shared';
import { movies as moviesApi, ratings as ratingsApi, watchlist as watchlistApi } from '@/lib/client';
import { cn } from '@/lib/ui';

type Mode = 'popular' | 'upcoming';

export function TMDBPopularSection({
  watchlistIds,
  ratedScores,
  onChanged,
  onPlanParty,
}: {
  /** tmdb ids already on the user's watchlist (for button state). */
  watchlistIds: Set<number>;
  /** tmdb id → my score, for the rating badge. */
  ratedScores: Record<number, number>;
  /** Fired after a watchlist add / rating so the shell can refresh its library. */
  onChanged: () => void;
  /** Plan a group outing for this movie (shown in Upcoming mode). */
  onPlanParty?: (movie: MovieDto) => void;
}) {
  const [mode, setMode] = useState<Mode>('popular');
  const [list, setList] = useState<MovieDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rateFor, setRateFor] = useState<number | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async (which: Mode) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const data = which === 'popular' ? await moviesApi.popular(25) : await moviesApi.upcoming();
      if (id === reqId.current) setList(data);
    } catch {
      if (id === reqId.current) setError('Could not reach the movie database. Try again.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setQuery('');
    load(mode);
  }, [mode, load]);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return load(mode);
    const id = ++reqId.current;
    setSearching(true);
    setError(null);
    try {
      const data = await moviesApi.search(query.trim());
      if (id === reqId.current) setList(data);
    } catch {
      if (id === reqId.current) setError('Search failed. Please try again.');
    } finally {
      if (id === reqId.current) setSearching(false);
    }
  };

  const addToWatchlist = async (m: MovieDto) => {
    if (m.tmdb_id == null) return;
    setBusyId(m.tmdb_id);
    try {
      await watchlistApi.add(m.tmdb_id);
      onChanged();
    } catch {
      /* surfaced by disabled/idle state; keep the grid responsive */
    } finally {
      setBusyId(null);
    }
  };

  const rate = async (m: MovieDto, score: number) => {
    if (m.tmdb_id == null) return;
    setBusyId(m.tmdb_id);
    try {
      await ratingsApi.upsert(m.tmdb_id, score);
      onChanged();
      setRateFor(null);
    } catch {
      /* ignore — user can retry */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-6 md:p-8 relative overflow-hidden border border-slate-700/50 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 blur-[96px] rounded-full pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-mono font-bold tracking-wider uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" /> TMDB Live Database
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {mode === 'popular' ? 'Popular Movies' : 'Upcoming Releases'}
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black italic tracking-tight uppercase">
              Explore {mode === 'popular' ? 'Popular' : 'Upcoming'} TMDB Releases
            </h2>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Straight from The Movie Database. Add any title to your watchlist or rate it to build your shelf.
            </p>
          </div>
          <button
            onClick={() => load(mode)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-xl text-sm transition-all shrink-0 self-start md:self-center backdrop-blur-md"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Refresh
          </button>
        </div>

        {/* Search + mode toggle */}
        <div className="mt-6 pt-6 border-t border-slate-700/60 flex flex-col md:flex-row items-stretch md:items-center gap-4">
          <form onSubmit={onSearch} className="relative flex-1">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any title in TMDB…"
              className="w-full bg-slate-950/70 border border-slate-700/80 rounded-2xl py-2.5 pl-11 pr-24 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); load(mode); }}
                className="absolute right-16 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white underline"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              disabled={searching}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-colors"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>
          <div className="flex items-center gap-2">
            {(['popular', 'upcoming'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors capitalize',
                  mode === m ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-500 p-4 rounded-2xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1 text-sm font-medium">{error}</div>
          <button onClick={() => load(mode)} className="px-3 py-1 bg-rose-500 text-white text-xs font-bold rounded-lg hover:bg-rose-600">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="bg-slate-200 dark:bg-slate-800/60 rounded-3xl aspect-[2/3] animate-pulse" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <Film className="w-12 h-12 mx-auto text-slate-400" />
          <h3 className="text-lg font-bold">No movies found</h3>
          <p className="text-slate-500 text-sm">Try a different search, or refresh the feed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {list.map((m) => {
            const id = m.tmdb_id ?? -1;
            const inWatchlist = watchlistIds.has(id);
            const myScore = ratedScores[id];
            const busy = busyId === id;
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -4 }}
                className="bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-md hover:shadow-xl group flex flex-col"
              >
                <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
                  {m.poster_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.poster_url}
                      alt={m.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-800" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-80" />
                  {m.year != null && (
                    <div className="absolute top-3 left-3 px-2 py-0.5 bg-white/20 backdrop-blur-md rounded-lg border border-white/30 text-[10px] font-mono font-bold text-white">
                      {m.year}
                    </div>
                  )}
                  {myScore != null && (
                    <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-orange-500 border-2 border-white/30 flex items-center justify-center text-white text-xs font-black shadow-lg">
                      {myScore}
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 right-3">
                    <h3 className="text-base font-extrabold text-white leading-tight line-clamp-2">{m.title}</h3>
                  </div>
                </div>

                <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                  {m.overview && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">{m.overview}</p>
                  )}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setRateFor(rateFor === id ? null : id)}
                      disabled={busy || id < 0}
                      className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 bg-orange-600 hover:bg-orange-500 text-white shadow-sm transition-all disabled:opacity-50"
                    >
                      <Star className="w-3.5 h-3.5" /> {myScore != null ? 'Rerate' : 'Rate'}
                    </button>
                    <button
                      onClick={() => addToWatchlist(m)}
                      disabled={inWatchlist || busy || id < 0}
                      title={inWatchlist ? 'On your watchlist' : 'Add to watchlist'}
                      className={cn(
                        'py-1.5 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all border',
                        inWatchlist
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                          : 'bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700',
                      )}
                    >
                      {inWatchlist ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {mode === 'upcoming' && onPlanParty && id > 0 && (
                    <button
                      onClick={() => onPlanParty(m)}
                      className="w-full py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white transition-all"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" /> Plan Watch Party
                    </button>
                  )}

                  <AnimatePresence>
                    {rateFor === id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="grid grid-cols-10 gap-1 overflow-hidden"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                          <button
                            key={v}
                            onClick={() => rate(m, v)}
                            disabled={busy}
                            className={cn(
                              'py-1 rounded-md text-[10px] font-mono font-black border transition-all disabled:opacity-50',
                              myScore === v
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'bg-white dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-orange-500 hover:text-orange-500',
                            )}
                          >
                            {v}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
