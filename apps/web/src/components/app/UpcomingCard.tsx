'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, MapPin, Flame, Clock, Check } from 'lucide-react';
import type {
  AppUserDto,
  MovieDto,
  OutingDto,
  RsvpStatus,
} from '@filmrave/shared';
import { outings as outingsApi } from '@/lib/client';
import { Avatar } from './Avatar';

type UserMap = Record<string, AppUserDto>;

const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: 'Going',
  maybe: 'Maybe',
  cant_go: "Can't",
};

export function UpcomingCard({
  outing,
  movie,
  users,
  currentUser,
  onChange,
}: {
  outing: OutingDto;
  movie: MovieDto | undefined;
  users: UserMap;
  currentUser: AppUserDto;
  onChange: (o: OutingDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const myHype = outing.hypes.find((h) => h.user_id === currentUser.user_id)?.score ?? 0;
  const myRsvp = outing.rsvps.find((r) => r.user_id === currentUser.user_id)?.status;
  const going = outing.rsvps.filter((r) => r.status === 'going');

  const leadingNight = [...outing.night_options].sort(
    (a, b) => b.voter_ids.length - a.voter_ids.length || a.position - b.position,
  )[0];

  const run = async (p: Promise<OutingDto>) => {
    setBusy(true);
    try {
      onChange(await p);
    } finally {
      setBusy(false);
    }
  };

  const userOf = (id: string) =>
    users[id] ?? { user_id: id, display_name: 'Member', handle: 'm' };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-indigo-600 border border-indigo-400 rounded-3xl overflow-hidden shadow-lg text-white"
    >
      <div className="h-44 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-indigo-600 via-indigo-600/40 to-transparent z-10" />
        {movie?.poster_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
        )}
        <div className="absolute top-4 right-4 z-20 flex gap-2">
          <div className="bg-orange-500/90 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
            <Flame className="w-4 h-4" />
            <span className="text-xs font-black">
              {outing.group_hype != null ? outing.group_hype.toFixed(1) : '—'}
            </span>
          </div>
          {movie?.release_date && (
            <div className="bg-white/20 backdrop-blur px-3 py-1.5 rounded-full flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span className="text-xs font-bold">{movie.release_date}</span>
            </div>
          )}
        </div>
      </div>

      <div className="p-5 relative z-20 -mt-8">
        <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-tighter">
          Upcoming Pick
        </span>
        <h3 className="text-2xl font-black leading-tight mt-3 mb-4 uppercase italic">
          {movie?.title ?? `Movie #${outing.movie_tmdb_id}`}
        </h3>

        {/* Hype slider */}
        <div className="mb-5">
          <div className="flex justify-between text-xs mb-2 text-indigo-200 font-bold uppercase tracking-wider">
            <span>Your Hype</span>
            <span>{myHype === 0 ? 'Not set' : myHype}</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={myHype}
            disabled={busy}
            onChange={(e) => run(outingsApi.setHype(outing.outing_id, parseInt(e.target.value)))}
            className="w-full accent-orange-500 h-1.5 bg-indigo-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* RSVP */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider">
              Who&apos;s going?
            </span>
            <span className="text-xs font-bold">{going.length} going</span>
          </div>
          <div className="flex -space-x-2 mb-3">
            {going.map((r) => (
              <Avatar key={r.user_id} user={userOf(r.user_id)} size="sm" ring className="border-indigo-600" />
            ))}
            {going.length === 0 && <span className="text-xs text-indigo-200">Nobody yet</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['going', 'maybe', 'cant_go'] as RsvpStatus[]).map((s) => (
              <button
                key={s}
                disabled={busy}
                onClick={() => run(outingsApi.rsvp(outing.outing_id, s))}
                className={`py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-colors ${
                  myRsvp === s
                    ? 'bg-white text-indigo-600'
                    : 'bg-indigo-700/60 text-indigo-100 hover:bg-indigo-700'
                }`}
              >
                {RSVP_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Night vote */}
        {outing.night_options.length > 0 && (
          <div className="pt-4 border-t border-indigo-500/50 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider">Vote on night</span>
              {leadingNight && (
                <span className="text-[10px] text-indigo-200">Leading: {leadingNight.label}</span>
              )}
            </div>
            <div className="space-y-2">
              {outing.night_options.map((n) => {
                const voted = n.voter_ids.includes(currentUser.user_id);
                return (
                  <button
                    key={n.option_id}
                    disabled={busy}
                    onClick={() => run(outingsApi.voteNight(outing.outing_id, n.option_id))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                      voted ? 'bg-white/20 border-white' : 'bg-indigo-700/50 border-indigo-400/30 hover:bg-indigo-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-200" />
                      <span className="text-sm font-semibold">{n.label}</span>
                    </div>
                    <div className="flex -space-x-1">
                      {n.voter_ids.map((id) => (
                        <Avatar key={id} user={userOf(id)} size="xs" ring className="border-indigo-700" />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Theater vote */}
        {outing.theater_options.length > 0 && (
          <div className="pt-4 border-t border-indigo-500/50">
            <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider block mb-3">
              Vote on theater
            </span>
            <div className="space-y-2">
              {outing.theater_options.map((t) => {
                const voted = t.voter_ids.includes(currentUser.user_id);
                return (
                  <button
                    key={t.option_id}
                    disabled={busy}
                    onClick={() => run(outingsApi.voteTheater(outing.outing_id, t.option_id))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                      voted ? 'bg-white/20 border-white' : 'bg-indigo-700/50 border-indigo-400/30 hover:bg-indigo-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-indigo-200" />
                      <span className="text-sm font-semibold">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {voted && <Check className="w-4 h-4" />}
                      <span className="text-xs font-bold">{t.voter_ids.length}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
