'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Star, MessageCircle, Send } from 'lucide-react';
import type { AppUserDto, MovieDto, RatingDto } from '@filmrave/shared';
import { circles, ratings as ratingsApi } from '@/lib/client';
import { timeAgo } from '@/lib/ui';
import { Avatar } from './Avatar';
import { useMovieChat } from './useMovieChat';

type UserMap = Record<string, AppUserDto>;

export function MovieRoomModal({
  circleId,
  movie,
  users,
  currentUser,
  onClose,
  onRated,
}: {
  circleId: string;
  movie: MovieDto;
  users: UserMap;
  currentUser: AppUserDto;
  onClose: () => void;
  onRated: () => void;
}) {
  const tmdbId = movie.tmdb_id as number;
  const [ratings, setRatings] = useState<RatingDto[]>([]);
  const [groupAvg, setGroupAvg] = useState<number | null>(null);
  const [myScore, setMyScore] = useState<number>(0);
  const [draft, setDraft] = useState('');
  const { messages, send, connected } = useMovieChat(circleId, tmdbId);

  const load = () => {
    circles
      .movieRatings(circleId, tmdbId)
      .then((rs) => {
        setRatings(rs);
        setMyScore(rs.find((r) => r.user_id === currentUser.user_id)?.score ?? 0);
      })
      .catch(() => {});
    circles
      .groupAverage(circleId, tmdbId)
      .then((g) => setGroupAvg(g.group_average))
      .catch(() => {});
  };

  useEffect(load, [circleId, tmdbId, currentUser.user_id]);

  const commitRating = async (score: number) => {
    setMyScore(score);
    if (score === 0) return;
    await ratingsApi.upsert(tmdbId, score);
    load();
    onRated();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    send(draft);
    setDraft('');
  };

  const userOf = (id: string): AppUserDto =>
    users[id] ?? { user_id: id, display_name: 'Member', handle: 'member' };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
    >
      <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-4xl bg-white/95 dark:bg-[#0A0A0C]/95 backdrop-blur-3xl rounded-[2rem] overflow-hidden shadow-[0_0_80px_rgba(249,115,22,0.15)] flex flex-col md:flex-row h-full max-h-[85vh] border border-white/10"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 w-10 h-10 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white rounded-full flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Poster */}
        <div className="w-full md:w-2/5 h-56 md:h-full relative shrink-0">
          {movie.poster_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-800" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white dark:to-[#0F0F12] hidden md:block" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent md:hidden" />
          <div className="absolute bottom-4 left-4 right-4 md:hidden">
            <h2 className="text-3xl font-black text-white uppercase italic tracking-tight">{movie.title}</h2>
          </div>
        </div>

        {/* Interaction */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="hidden md:block mb-6">
              <div className="flex gap-2 mb-3">
                {movie.year && (
                  <span className="text-xs font-mono px-3 py-1 bg-slate-100 dark:bg-slate-800/80 rounded-full text-slate-600 dark:text-slate-300">
                    {movie.year}
                  </span>
                )}
                {movie.runtime && (
                  <span className="text-xs font-mono px-3 py-1 bg-slate-100 dark:bg-slate-800/80 rounded-full text-slate-600 dark:text-slate-300">
                    {movie.runtime} min
                  </span>
                )}
              </div>
              <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase italic tracking-tight leading-none">
                {movie.title}
              </h2>
            </div>

            {movie.overview && (
              <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base leading-relaxed mb-8">
                {movie.overview}
              </p>
            )}

            {/* Group consensus */}
            <div className="mb-8">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 text-orange-500 fill-orange-500" />
                Group Consensus: {groupAvg != null ? groupAvg.toFixed(1) : '—'} / 10
              </h3>
              <div className="flex flex-wrap gap-3">
                {ratings.map((r) => (
                  <div
                    key={r.user_id}
                    className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700/50"
                  >
                    <Avatar user={userOf(r.user_id)} size="sm" />
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{r.score}</span>
                    {r.user_id === currentUser.user_id &&
                      groupAvg != null &&
                      !ratings.some(
                        (o) => o.user_id !== currentUser.user_id,
                      ) && <span className="text-[9px] text-slate-500">only you</span>}
                  </div>
                ))}
                {ratings.length === 0 && (
                  <span className="text-sm text-slate-500 italic">No shared ratings yet.</span>
                )}
              </div>
            </div>

            {/* My rating — 1..10 quick-select grid + a precision slider */}
            <div className="mb-8 p-5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/30 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Your Rating
                </h3>
                {myScore > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-mono font-bold uppercase tracking-wider">
                    {myScore >= 9 ? 'Masterpiece 🏆' : myScore >= 7 ? 'Great 👍' : myScore >= 5 ? 'Decent 🍿' : 'Poor 👎'}
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between mb-3">
                <span className="font-mono text-3xl font-black text-orange-600 dark:text-orange-500">
                  {myScore > 0 ? myScore.toFixed(0) : '–'}
                  <span className="text-sm text-slate-400"> / 10</span>
                </span>
                <Star className="w-8 h-8 text-orange-500 fill-orange-500" />
              </div>
              <div className="grid grid-cols-10 gap-1 sm:gap-1.5 mb-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => commitRating(v)}
                    className={`py-2 rounded-xl text-xs font-mono font-black transition-all border ${
                      myScore === v
                        ? 'bg-orange-500 text-white border-orange-500 scale-105 shadow-md shadow-orange-500/30 ring-2 ring-orange-400'
                        : 'bg-white dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-orange-500 hover:text-orange-500'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={myScore}
                onChange={(e) => commitRating(parseInt(e.target.value))}
                className="w-full accent-orange-500 h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mt-1">
                <span>Awful</span>
                <span>Average</span>
                <span>Masterpiece</span>
              </div>
            </div>

            {/* Discussion */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-indigo-500" />
                Discussion ({messages.length})
                <span
                  className={`ml-1 w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-500'}`}
                  title={connected ? 'Live' : 'Connecting…'}
                />
              </h3>
              <div className="space-y-5">
                {messages.map((m) => {
                  const isMe = m.user_id === currentUser.user_id;
                  return (
                    <div key={m.message_id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <Avatar user={userOf(m.user_id)} size="sm" className="mt-auto" />
                      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]`}>
                        <div className="flex items-baseline gap-2 mb-1 px-1">
                          <span className="text-[10px] font-bold text-slate-500">
                            {isMe ? 'You' : userOf(m.user_id).display_name}
                          </span>
                          <span className="text-[8px] font-mono text-slate-400">{timeAgo(m.sent_at)}</span>
                        </div>
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                            isMe
                              ? 'bg-orange-600 text-white rounded-br-sm'
                              : 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-200 rounded-bl-sm border border-slate-200 dark:border-slate-700/50'
                          }`}
                        >
                          {m.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <MessageCircle className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">Be the first to share your thoughts.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <form
            onSubmit={submit}
            className="p-4 md:p-6 bg-slate-50 dark:bg-[#141417] border-t border-slate-200 dark:border-slate-800 flex items-end gap-3"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) submit(e);
              }}
              placeholder="Share your review…"
              rows={1}
              className="flex-1 bg-white dark:bg-[#0A0A0B] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm resize-none min-h-[52px] max-h-32 focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="h-[52px] px-5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}
