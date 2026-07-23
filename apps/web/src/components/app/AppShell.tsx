'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  CalendarDays,
  Check,
  Clapperboard,
  Film,
  History,
  LogOut,
  Menu,
  Plus,
  Search,
  Shield,
  Star,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type {
  AppUserDto,
  CircleDto,
  FeedItemDto,
  MovieDto,
  OutingDto,
  RatingDto,
  RatingsShared,
  WatchlistEntryDto,
} from '@filmrave/shared';
import {
  circles as circlesApi,
  friends as friendsApi,
  movies as moviesApi,
  notifications as notifApi,
  outings as outingsApi,
  ratings as ratingsApi,
  watchlist as watchlistApi,
} from '@/lib/client';
import { useRequireAuth } from '@/lib/session';
import { cn } from '@/lib/ui';
import { Avatar } from './Avatar';
import { MovieCard } from './MovieCard';
import { MovieRoomModal } from './MovieRoomModal';
import { UpcomingCard } from './UpcomingCard';
import { NewCircleModal } from './NewCircleModal';
import { LogMovieModal } from './LogMovieModal';
import { NotificationsPanel } from './NotificationsPanel';
import { ImportRatingsModal } from './ImportRatingsModal';

type UserMap = Record<string, AppUserDto>;
type MainView = 'group' | 'watchlist' | 'rated' | 'friends' | 'circles';
type Tab = 'feed' | 'upcoming' | 'cowatched';

const SHARING_LABEL: Record<RatingsShared, string> = {
  approved: 'Sharing all',
  selective: 'Sharing some',
  none: 'Private',
};

export function AppShell() {
  const { user, ready, signOut } = useRequireAuth();

  const [circleList, setCircleList] = useState<CircleDto[]>([]);
  const [activeCircleId, setActiveCircleId] = useState<string | null>(null);
  const [userMap, setUserMap] = useState<UserMap>({});
  const [feed, setFeed] = useState<FeedItemDto[]>([]);
  const [outings, setOutings] = useState<OutingDto[]>([]);
  const [movieCache, setMovieCache] = useState<Record<number, MovieDto>>({});
  const [myRatings, setMyRatings] = useState<RatingDto[]>([]);
  const [watchlistEntries, setWatchlistEntries] = useState<WatchlistEntryDto[]>([]);
  const [friendUsers, setFriendUsers] = useState<AppUserDto[]>([]);
  const [unread, setUnread] = useState(0);

  const [mainView, setMainView] = useState<MainView>('group');
  const [tab, setTab] = useState<Tab>('feed');
  const [openMovie, setOpenMovie] = useState<MovieDto | null>(null);
  const [showNewCircle, setShowNewCircle] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<AppUserDto[]>([]);

  const activeCircle = circleList.find((c) => c.group_id === activeCircleId) ?? null;
  const myMembership = activeCircle?.members.find((m) => m.user_id === user?.user_id);

  const mergeUsers = useCallback((list: AppUserDto[]) => {
    setUserMap((prev) => {
      const next = { ...prev };
      for (const u of list) next[u.user_id] = u;
      return next;
    });
  }, []);

  const hydrateMovies = useCallback(
    async (ids: number[]) => {
      const missing = [...new Set(ids)].filter((id) => !movieCache[id]);
      if (missing.length === 0) return;
      const fetched = await Promise.allSettled(missing.map((id) => moviesApi.get(id)));
      setMovieCache((prev) => {
        const next = { ...prev };
        fetched.forEach((r) => {
          if (r.status === 'fulfilled' && r.value.tmdb_id != null) {
            next[r.value.tmdb_id] = r.value;
          }
        });
        return next;
      });
    },
    [movieCache],
  );

  // Bootstrap: circles + notifications + personal library.
  useEffect(() => {
    if (!user) return;
    circlesApi
      .list()
      .then((cs) => {
        setCircleList(cs);
        setActiveCircleId((prev) => prev ?? cs[0]?.group_id ?? null);
      })
      .catch(() => {});
    notifApi.unreadCount().then((r) => setUnread(r.count)).catch(() => {});
    refreshLibrary();
    refreshFriends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Per-circle data.
  useEffect(() => {
    if (!activeCircleId) return;
    circlesApi.members(activeCircleId).then(mergeUsers).catch(() => {});
    circlesApi.feed(activeCircleId).then(setFeed).catch(() => setFeed([]));
    outingsApi
      .list(activeCircleId)
      .then((os) => {
        setOutings(os);
        hydrateMovies(os.map((o) => o.movie_tmdb_id));
      })
      .catch(() => setOutings([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCircleId]);

  const refreshFeed = useCallback(() => {
    if (activeCircleId) circlesApi.feed(activeCircleId).then(setFeed).catch(() => {});
  }, [activeCircleId]);

  const refreshLibrary = useCallback(async () => {
    const [rs, wl] = await Promise.all([
      ratingsApi.mine().catch(() => []),
      watchlistApi.list().catch(() => []),
    ]);
    setMyRatings(rs);
    setWatchlistEntries(wl);
    hydrateMovies([...rs.map((r) => r.movie_tmdb_id), ...wl.map((w) => w.movie_tmdb_id)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshFriends = useCallback(async () => {
    const rels = await friendsApi.list().catch(() => []);
    const ids = new Set<string>();
    rels.forEach((r) => {
      if (r.status === 'friends') {
        ids.add(r.user_id === user?.user_id ? r.other_id : r.user_id);
      }
    });
    // Names come from userMap (populated by circle members); keep known ones.
    setFriendUsers((prev) => prev.filter((u) => ids.has(u.user_id)));
  }, [user]);

  const runSearch = async (q: string) => {
    setSearch(q);
    if (q.trim().length < 2) return setSearchResults([]);
    const res = await friendsApi.search(q.trim()).catch(() => []);
    mergeUsers(res);
    setSearchResults(res);
  };

  const addFriend = async (id: string) => {
    await friendsApi.request(id).catch(() => {});
    // Seeded users are mutual friends already; reflect immediately.
    const u = userMap[id];
    if (u) setFriendUsers((prev) => (prev.some((x) => x.user_id === u.user_id) ? prev : [...prev, u]));
  };

  const coWatched = useMemo(() => feed.filter((f) => f.co_watched), [feed]);
  const friendCandidates = useMemo(
    () => Object.values(userMap).filter((u) => u.user_id !== user?.user_id),
    [userMap, user],
  );

  if (!ready || !user) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  const NavButton = ({
    active,
    onClick,
    icon: Icon,
    label,
  }: {
    active: boolean;
    onClick: () => void;
    icon: typeof Film;
    label: string;
  }) => (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm',
        active
          ? 'bg-slate-800 text-white font-bold'
          : 'text-slate-400 hover:text-white hover:bg-slate-800/50 font-medium',
      )}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <div className="dark">
      <div className="min-h-screen bg-[#0A0A0B] text-slate-100 font-sans flex overflow-hidden relative">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-orange-600/10 blur-[128px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600/10 blur-[128px] rounded-full pointer-events-none" />

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed md:static inset-y-0 left-0 z-50 w-64 border-r border-slate-800 bg-[#1A1A1D] flex flex-col flex-shrink-0 transition-transform duration-300',
            mobileNav ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          )}
        >
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3 text-white font-bold text-xl tracking-tight">
              <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Clapperboard className="w-5 h-5 text-white" />
              </div>
              Film Rave
            </div>
            <button className="md:hidden text-slate-500" onClick={() => setMobileNav(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 pb-4 space-y-1">
            <div className="text-xs font-mono text-slate-500 uppercase tracking-wider px-2 mb-3">Home</div>
            <NavButton active={mainView === 'circles'} onClick={() => { setMainView('circles'); setMobileNav(false); }} icon={Users} label="Your Circles" />
          </div>
          <div className="px-4 pb-4 space-y-1">
            <div className="text-xs font-mono text-slate-500 uppercase tracking-wider px-2 mb-3">My Library</div>
            <NavButton active={mainView === 'watchlist'} onClick={() => { setMainView('watchlist'); setMobileNav(false); }} icon={History} label="Watchlist" />
            <NavButton active={mainView === 'rated'} onClick={() => { setMainView('rated'); setMobileNav(false); }} icon={Star} label="Rated Movies" />
          </div>
          <div className="px-4 pb-4 space-y-1">
            <div className="text-xs font-mono text-slate-500 uppercase tracking-wider px-2 mb-3">Network</div>
            <NavButton active={mainView === 'friends'} onClick={() => { setMainView('friends'); setMobileNav(false); }} icon={Users} label="Friends" />
          </div>

          <div className="px-4 flex-1 overflow-y-auto">
            <div className="text-xs font-mono text-slate-500 uppercase tracking-wider px-2 mb-3">Circles</div>
            {circleList.map((c) => (
              <button
                key={c.group_id}
                onClick={() => { setActiveCircleId(c.group_id); setMainView('group'); setMobileNav(false); }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all border mb-1',
                  activeCircleId === c.group_id && mainView === 'group'
                    ? 'bg-slate-800/80 text-white border-slate-700/50'
                    : 'border-transparent text-slate-400 hover:bg-slate-800/50',
                )}
              >
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-medium truncate">{c.name}</span>
                </div>
                {activeCircleId === c.group_id && mainView === 'group' && (
                  <div className="w-2 h-2 bg-orange-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-slate-800/50">
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar user={user} size="md" />
              <div className="flex flex-col items-start leading-tight flex-1">
                <span className="text-sm font-medium text-slate-200">{user.display_name}</span>
                <span className="text-[10px] text-slate-500">@{user.handle}</span>
              </div>
              <button onClick={signOut} title="Sign out" className="text-slate-400 hover:text-white">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
          <header className="flex-shrink-0 h-16 md:h-20 px-4 md:px-8 flex items-center justify-between border-b border-slate-800 bg-[#0A0A0B]/80 backdrop-blur-xl z-10">
            <div className="flex items-center gap-4">
              <button className="md:hidden text-slate-500" onClick={() => setMobileNav(true)}>
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-lg md:text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                {mainView === 'group' && (
                  <>
                    <span className="text-orange-500">{activeCircle?.name ?? 'Circle'}</span>
                    {myMembership && (
                      <button
                        onClick={cycleSharing}
                        title="Change your rating sharing"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1A1A1D] border border-slate-800 text-[10px] md:text-xs font-mono text-slate-400 uppercase tracking-widest hover:border-orange-500 transition-colors"
                      >
                        <Shield className="w-3 h-3" /> {SHARING_LABEL[myMembership.ratings_shared]}
                      </button>
                    )}
                  </>
                )}
                {mainView === 'watchlist' && 'My Watchlist'}
                {mainView === 'rated' && 'Rated Movies'}
                {mainView === 'friends' && 'Friends'}
                {mainView === 'circles' && 'Your Circles'}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {mainView === 'group' && activeCircle && (
                <div className="hidden md:flex -space-x-2">
                  {activeCircle.members.map((m) => {
                    const u = userMap[m.user_id];
                    return u ? <Avatar key={m.user_id} user={u} size="md" ring /> : null;
                  })}
                </div>
              )}
              <button onClick={() => setShowNotifs(true)} className="text-slate-400 hover:text-white relative">
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-orange-500 rounded-full text-[10px] font-bold flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto z-10">
            <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">
              <AnimatePresence mode="wait">
                {mainView === 'group' && renderGroup()}
                {mainView === 'watchlist' && renderWatchlist()}
                {mainView === 'rated' && renderRated()}
                {mainView === 'friends' && renderFriends()}
                {mainView === 'circles' && renderCircles()}
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>

      {openMovie && activeCircleId && (
        <MovieRoomModal
          circleId={activeCircleId}
          movie={openMovie}
          users={userMap}
          currentUser={user}
          onClose={() => setOpenMovie(null)}
          onRated={() => { refreshFeed(); refreshLibrary(); }}
        />
      )}
      {showNewCircle && (
        <NewCircleModal
          candidates={friendCandidates}
          onClose={() => setShowNewCircle(false)}
          onCreated={(c) => {
            setCircleList((prev) => [...prev, c]);
            setActiveCircleId(c.group_id);
            setMainView('group');
            setShowNewCircle(false);
          }}
        />
      )}
      {showLog && activeCircleId && (
        <LogMovieModal circleId={activeCircleId} onClose={() => setShowLog(false)} onLogged={refreshFeed} />
      )}
      {showImport && (
        <ImportRatingsModal
          onClose={() => setShowImport(false)}
          onImported={() => { refreshLibrary(); refreshFeed(); }}
        />
      )}
      <AnimatePresence>
        {showNotifs && (
          <NotificationsPanel
            onClose={() => setShowNotifs(false)}
            onChanged={() => notifApi.unreadCount().then((r) => setUnread(r.count)).catch(() => {})}
          />
        )}
      </AnimatePresence>
    </div>
  );

  // --- sharing ---
  async function cycleSharing() {
    if (!activeCircleId || !myMembership) return;
    const order: RatingsShared[] = ['none', 'approved', 'selective'];
    const next = order[(order.indexOf(myMembership.ratings_shared) + 1) % order.length];
    const updated = await circlesApi
      .updateSharing(activeCircleId, next, myMembership.shared_movie_ids ?? [])
      .catch(() => null);
    if (updated) {
      setCircleList((prev) => prev.map((c) => (c.group_id === updated.group_id ? updated : c)));
      refreshFeed();
    }
  }

  // --- views ---
  function renderGroup() {
    return (
      <motion.div key="group" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="flex items-center gap-6 border-b border-slate-800 mb-8 overflow-x-auto">
          {([
            { id: 'feed', label: 'Group Feed', icon: Film },
            { id: 'upcoming', label: 'Upcoming', icon: CalendarDays },
            { id: 'cowatched', label: 'Co-Watched', icon: History },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'pb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider relative whitespace-nowrap',
                tab === t.id ? 'text-white' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              <t.icon className="w-4 h-4" /> {t.label}
              {tab === t.id && (
                <motion.div layoutId="tabInd" className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
              )}
            </button>
          ))}
        </div>

        {tab === 'feed' && (
          feed.length === 0 ? (
            <EmptyState icon={Film} title="No movies yet" body="Rate a movie or log a co-watch to fill your feed." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {feed.map((item) => (
                <MovieCard key={item.movie.tmdb_id} item={item} onOpen={() => setOpenMovie(item.movie)} />
              ))}
            </div>
          )
        )}

        {tab === 'upcoming' && (
          outings.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No outings planned" body="Upcoming releases your circle plans to see will appear here." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {outings.map((o) => (
                <UpcomingCard
                  key={o.outing_id}
                  outing={o}
                  movie={movieCache[o.movie_tmdb_id]}
                  users={userMap}
                  currentUser={user!}
                  onChange={(u) => setOutings((prev) => prev.map((x) => (x.outing_id === u.outing_id ? u : x)))}
                />
              ))}
            </div>
          )
        )}

        {tab === 'cowatched' && (
          <>
            <div className="flex justify-end mb-6">
              <button
                onClick={() => setShowLog(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-full uppercase tracking-widest text-sm"
              >
                <Plus className="w-4 h-4" /> Log a Movie
              </button>
            </div>
            {coWatched.length === 0 ? (
              <EmptyState icon={History} title="No co-watched movies yet" body="Log a movie you watched together to discuss and rate it." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {coWatched.map((item) => (
                  <MovieCard key={item.movie.tmdb_id} item={item} onOpen={() => setOpenMovie(item.movie)} />
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>
    );
  }

  function renderWatchlist() {
    return (
      <motion.div key="wl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {watchlistEntries.map((w) => {
          const m = movieCache[w.movie_tmdb_id];
          return <PosterTile key={w.movie_tmdb_id} movie={m} title={m?.title} />;
        })}
        {watchlistEntries.length === 0 && (
          <div className="col-span-full"><EmptyState icon={History} title="Watchlist empty" body="Movies you want to see will show up here." /></div>
        )}
      </motion.div>
    );
  }

  function renderRated() {
    return (
      <motion.div key="rated" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#141417] border border-slate-800 hover:border-orange-500 text-white font-bold rounded-full uppercase tracking-widest text-sm transition-colors"
          >
            <Upload className="w-4 h-4" /> Import from IMDb / Letterboxd
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {myRatings.map((r) => {
            const m = movieCache[r.movie_tmdb_id];
            return <PosterTile key={r.movie_tmdb_id} movie={m} title={m?.title} score={r.score} />;
          })}
          {myRatings.length === 0 && (
            <div className="col-span-full"><EmptyState icon={Star} title="No ratings yet" body="Import your history or rate a movie to build your shelf." /></div>
          )}
        </div>
      </motion.div>
    );
  }

  function renderFriends() {
    return (
      <motion.div key="friends" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="bg-[#141417] border border-slate-800 rounded-3xl p-6">
          <h2 className="text-xl font-bold mb-4">Find Friends</h2>
          <div className="relative mb-8">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search by @handle or name"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          {searchResults.length > 0 && (
            <FriendList title="Search results" users={searchResults} friendIds={new Set(friendUsers.map((f) => f.user_id))} onAdd={addFriend} />
          )}
          <FriendList title="Your friends" users={friendUsers} friendIds={new Set(friendUsers.map((f) => f.user_id))} onAdd={addFriend} />
          <div className="mt-10 pt-6 border-t border-slate-800">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Your invite link</h3>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-slate-900 px-4 py-3 rounded-xl border border-slate-700 font-mono text-sm truncate">
                filmrave.app/add/@{user!.handle}
              </code>
              <button
                onClick={() => navigator.clipboard?.writeText(`filmrave.app/add/@${user!.handle}`)}
                className="px-4 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-500"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  function renderCircles() {
    return (
      <motion.div key="circles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {circleList.map((c) => (
          <button
            key={c.group_id}
            onClick={() => { setActiveCircleId(c.group_id); setMainView('group'); }}
            className="bg-[#141417] border border-slate-800 rounded-3xl p-6 text-left hover:border-orange-500 transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-black italic tracking-tight">{c.name}</h2>
              <div className="flex -space-x-2">
                {c.members.slice(0, 5).map((m) => {
                  const u = userMap[m.user_id];
                  return u ? <Avatar key={m.user_id} user={u} size="sm" ring className="border-[#141417]" /> : null;
                })}
              </div>
            </div>
            <p className="text-slate-500 text-sm font-mono">{c.members.length} members</p>
          </button>
        ))}
        <button
          onClick={() => setShowNewCircle(true)}
          className="border-2 border-dashed border-slate-700 rounded-3xl p-6 flex flex-col items-center justify-center text-slate-500 hover:text-white hover:border-slate-600 transition-colors min-h-[140px]"
        >
          <Plus className="w-8 h-8 mb-2" />
          <span className="font-bold">New circle</span>
        </button>
      </motion.div>
    );
  }
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Film; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-4 border border-slate-800">
        <Icon className="w-8 h-8 text-slate-500" />
      </div>
      <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-slate-400 max-w-md">{body}</p>
    </div>
  );
}

function PosterTile({ movie, title, score }: { movie?: MovieDto; title?: string; score?: number }) {
  return (
    <div className="relative rounded-2xl overflow-hidden aspect-[2/3] bg-slate-800 shadow-md group">
      {movie?.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={movie.poster_url} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
      ) : (
        <div className="w-full h-full bg-slate-800" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
      {score != null && (
        <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white font-black shadow-lg">
          {score}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <h3 className="text-white font-bold leading-tight">{title ?? 'Movie'}</h3>
      </div>
    </div>
  );
}

function FriendList({
  title,
  users,
  friendIds,
  onAdd,
}: {
  title: string;
  users: AppUserDto[];
  friendIds: Set<string>;
  onAdd: (id: string) => void;
}) {
  if (users.length === 0) return null;
  return (
    <div className="mb-8">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">{title}</h3>
      <div className="space-y-4">
        {users.map((u) => {
          const added = friendIds.has(u.user_id);
          return (
            <div key={u.user_id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar user={u} size="md" />
                <div>
                  <div className="font-bold">{u.display_name}</div>
                  <div className="text-xs text-slate-500">@{u.handle}</div>
                </div>
              </div>
              <button
                onClick={() => onAdd(u.user_id)}
                disabled={added}
                className={cn(
                  'px-4 py-1.5 border rounded-lg text-sm font-bold transition-colors flex items-center gap-1',
                  added
                    ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                    : 'border-slate-700 hover:bg-slate-800',
                )}
              >
                {added ? (<><Check className="w-3 h-3" /> Friends</>) : 'Add'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
