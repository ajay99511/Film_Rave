'use client';

/**
 * Create or edit a circle. Wired to the real `circles.create` / `circles.update`
 * endpoints, including the genre-focus, privacy, and banner identity fields that
 * are now persisted on CircleDto. In edit mode the form is prefilled and the
 * member roster is diffed server-side.
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Users, Check, Lock, Globe, Film, Palette } from 'lucide-react';
import type { AppUserDto, CircleDto, CirclePrivacy } from '@filmrave/shared';
import { circles as circlesApi } from '@/lib/client';
import { cn } from '@/lib/ui';
import { Avatar } from './Avatar';

const GENRE_OPTIONS = [
  'General / All Genres',
  'Sci-Fi & Action',
  'Horror & Thriller',
  'Drama & Festival Cinema',
  'Comedy & Animation',
  'Documentaries & True Story',
  'Classic & Vintage Cinema',
];

const BANNERS = [
  'from-orange-600 via-amber-600 to-red-600',
  'from-purple-900 via-slate-900 to-indigo-950',
  'from-blue-700 via-indigo-800 to-slate-900',
  'from-emerald-700 via-teal-900 to-slate-950',
  'from-rose-600 via-pink-700 to-slate-900',
];

export function CircleFormModal({
  mode,
  circle,
  candidates,
  currentUserId,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  circle?: CircleDto;
  /** Selectable users for the roster (friends + any existing members). */
  candidates: AppUserDto[];
  currentUserId: string;
  onClose: () => void;
  onSaved: (c: CircleDto) => void;
}) {
  const [name, setName] = useState(circle?.name ?? '');
  const [description, setDescription] = useState(circle?.description ?? '');
  const [genre, setGenre] = useState(circle?.genre_focus ?? GENRE_OPTIONS[0]);
  const [privacy, setPrivacy] = useState<CirclePrivacy>(circle?.privacy ?? 'private');
  const [banner, setBanner] = useState(circle?.banner_gradient ?? BANNERS[0]);
  const [members, setMembers] = useState<string[]>(
    circle ? circle.members.map((m) => m.user_id).filter((id) => id !== currentUserId) : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const identity = { genre_focus: genre, privacy, banner_gradient: banner };
      const saved =
        mode === 'edit' && circle
          ? await circlesApi.update(circle.group_id, {
              name: name.trim(),
              description: description.trim(),
              member_ids: members,
              ...identity,
            })
          : await circlesApi.create(name.trim(), description.trim(), members, identity);
      onSaved(saved);
    } catch {
      setError('Could not save the circle. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-xl bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl my-auto"
      >
        <div className={cn('p-6 bg-gradient-to-r text-white relative', banner)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <h2 className="text-xl font-black italic tracking-tight uppercase">
                {mode === 'edit' ? 'Edit Circle' : 'Create New Circle'}
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-white/80 text-xs mt-1">Set your circle&apos;s identity, access, and roster.</p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Circle Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Friday Night Horror Squad"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What do you all watch together?"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-orange-500" /> Genre Focus
              </label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-3 py-3 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {GENRE_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                {privacy === 'private' ? <Lock className="w-3.5 h-3.5 text-orange-500" /> : <Globe className="w-3.5 h-3.5 text-emerald-500" />}
                Access Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPrivacy('private')}
                  className={cn(
                    'py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border',
                    privacy === 'private'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800',
                  )}
                >
                  <Lock className="w-3.5 h-3.5" /> Private
                </button>
                <button
                  type="button"
                  onClick={() => setPrivacy('public')}
                  className={cn(
                    'py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border',
                    privacy === 'public'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800',
                  )}
                >
                  <Globe className="w-3.5 h-3.5" /> Public
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-purple-500" /> Banner Theme
            </label>
            <div className="grid grid-cols-5 gap-2">
              {BANNERS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBanner(b)}
                  className={cn(
                    'h-10 rounded-xl bg-gradient-to-r border-2 transition-transform',
                    b,
                    banner === b ? 'border-white scale-105 shadow-lg ring-2 ring-orange-500' : 'border-transparent hover:scale-105',
                  )}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Members ({members.length + 1})
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {candidates.length === 0 && (
                <p className="text-sm text-slate-500">Add friends first to invite them.</p>
              )}
              {candidates.map((u) => {
                const on = members.includes(u.user_id);
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => toggle(u.user_id)}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded-2xl border transition-all',
                      on
                        ? 'bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/30'
                        : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar user={u} size="md" />
                      <div className="text-left">
                        <span className="font-bold text-xs text-slate-900 dark:text-white block">{u.display_name}</span>
                        <span className="text-[10px] text-slate-400">@{u.handle}</span>
                      </div>
                    </div>
                    <div className={cn('w-5 h-5 rounded-full border flex items-center justify-center', on ? 'bg-orange-500 border-orange-500' : 'border-slate-300 dark:border-slate-700')}>
                      {on && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-rose-500 text-sm">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || busy}
              className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white text-xs font-bold rounded-2xl transition-all shadow-lg shadow-orange-600/20"
            >
              {busy ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Create Circle'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
