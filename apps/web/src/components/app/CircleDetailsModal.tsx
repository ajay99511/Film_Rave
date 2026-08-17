'use client';

/**
 * Circle inspector — Overview + Movies. Both tabs read real endpoints
 * (`circles.members`, `circles.feed`), so nothing here is mocked. There is no
 * "circle chat" tab on purpose: the backend scopes chat to a (circle, movie)
 * thread, so discussion lives inside each movie's room — opening a movie here
 * routes to MovieRoomModal via `onOpenMovie`.
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Users, Film, Sparkles, Star, Edit, Trash2 } from 'lucide-react';
import type { AppUserDto, CircleDto, FeedItemDto, MovieDto } from '@filmrave/shared';
import { circles as circlesApi } from '@/lib/client';
import { cn } from '@/lib/ui';
import { Avatar } from './Avatar';
import { circleTheme } from './circle-theme';

type Tab = 'overview' | 'movies';

export function CircleDetailsModal({
  circle,
  onClose,
  onOpenMovie,
  onOpenFeed,
  onEdit,
  onDelete,
}: {
  circle: CircleDto;
  onClose: () => void;
  onOpenMovie: (circle: CircleDto, movie: MovieDto) => void;
  onOpenFeed: (circle: CircleDto) => void;
  onEdit: (circle: CircleDto) => void;
  onDelete: (circle: CircleDto) => void;
}) {
  const t = circleTheme(circle);
  const [tab, setTab] = useState<Tab>('overview');
  const [members, setMembers] = useState<AppUserDto[]>([]);
  const [feed, setFeed] = useState<FeedItemDto[]>([]);

  useEffect(() => {
    circlesApi.members(circle.group_id).then(setMembers).catch(() => setMembers([]));
    circlesApi.feed(circle.group_id).then(setFeed).catch(() => setFeed([]));
  }, [circle.group_id]);

  const topPick = [...feed]
    .filter((f) => f.group_average != null)
    .sort((a, b) => (b.group_average ?? 0) - (a.group_average ?? 0))[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-3xl bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[85vh]"
      >
        {/* Banner */}
        <div className={cn('p-6 md:p-8 bg-gradient-to-r text-white relative shrink-0', t.banner)}>
          <div className="flex items-start justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 border border-white/20">
                  <Film className="w-3 h-3" /> {t.genre}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-mono font-bold uppercase tracking-wider border border-white/20">
                  {t.privacy}
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black italic tracking-tight uppercase">{circle.name}</h2>
              <p className="text-white/80 text-xs md:text-sm mt-1 max-w-xl line-clamp-2">
                {circle.description || 'A movie-loving circle of friends.'}
              </p>
            </div>
            <button onClick={onClose} className="p-2 bg-black/20 hover:bg-black/40 rounded-xl text-white transition-colors shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-6 pt-4 border-t border-white/20 flex items-center gap-3">
            <div className="flex -space-x-2">
              {members.map((m) => (
                <Avatar key={m.user_id} user={m} size="md" ring className="border-white/30" />
              ))}
            </div>
            <span className="text-xs font-mono text-white/90 font-bold">{circle.members.length} members</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          {([
            { id: 'overview', label: 'Overview', icon: Sparkles },
            { id: 'movies', label: `Movies (${feed.length})`, icon: Film },
          ] as const).map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className={cn(
                'py-3.5 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors uppercase tracking-wider',
                tab === x.id
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300',
              )}
            >
              <x.icon className="w-4 h-4" /> {x.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-y-auto">
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Stat label="Movies" value={String(feed.length)} />
                <Stat label="Top Pick" value={topPick ? `${topPick.movie.title}` : '—'} accent />
                <Stat label="Members" value={String(circle.members.length)} className="col-span-2 md:col-span-1" />
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-orange-500" /> Member Roster
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {members.map((m) => (
                    <div key={m.user_id} className="flex items-center gap-3 p-2.5 bg-white dark:bg-[#1A1A1E] border border-slate-200 dark:border-slate-800 rounded-xl">
                      <Avatar user={m} size="md" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">{m.display_name}</span>
                        <span className="text-[10px] text-slate-400">@{m.handle}</span>
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && <p className="text-sm text-slate-500">Loading members…</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => onOpenFeed(circle)}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
                >
                  Open Feed
                </button>
                <button
                  onClick={() => onEdit(circle)}
                  title="Edit circle"
                  className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(circle)}
                  title="Delete circle"
                  className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded-xl transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {tab === 'movies' && (
            feed.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-200 dark:border-slate-800">
                <Film className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <p className="text-sm text-slate-500 font-bold">No movies in this circle yet.</p>
                <p className="text-xs text-slate-400 mt-1">Rate a movie or log a co-watch to fill the feed.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {feed.map((item) => (
                  <button
                    key={item.movie.tmdb_id}
                    onClick={() => onOpenMovie(circle, item.movie)}
                    className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex gap-3 cursor-pointer hover:border-orange-500 transition-colors text-left"
                  >
                    {item.movie.poster_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.movie.poster_url} alt={item.movie.title} className="w-16 h-20 object-cover rounded-xl" />
                    ) : (
                      <div className="w-16 h-20 bg-slate-200 dark:bg-slate-800 rounded-xl" />
                    )}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="text-[10px] font-mono text-slate-400">{item.movie.year ?? ''}</div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2">{item.movie.title}</h4>
                      </div>
                      <div className="flex items-center gap-1 text-xs font-bold text-orange-500">
                        <Star className="w-3.5 h-3.5 fill-orange-500" />
                        <span>{item.group_average != null ? `${item.group_average.toFixed(1)} / 10` : 'Unrated'}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Stat({ label, value, accent, className }: { label: string; value: string; accent?: boolean; className?: string }) {
  return (
    <div className={cn('bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl', className)}>
      <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">{label}</span>
      <span className={cn('font-black line-clamp-1', accent ? 'text-sm text-orange-500' : 'text-2xl text-slate-900 dark:text-white')}>
        {value}
      </span>
    </div>
  );
}
