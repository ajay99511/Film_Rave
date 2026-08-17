'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Clock,
  Database,
  Film,
  Globe,
  History,
  Lock,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Send,
  Shield,
  Sparkles,
  Star,
  Sun,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AppUserDto,
  CircleDto,
  FeedItemDto,
  FriendRelationshipDto,
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
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/ui';
import { Avatar } from './Avatar';
import { MovieCard } from './MovieCard';
import { MovieRoomModal } from './MovieRoomModal';
import { UpcomingCard } from './UpcomingCard';
import { CircleFormModal } from './CircleFormModal';
import { ConfirmModal } from './ConfirmModal';
import { LogMovieModal } from './LogMovieModal';
import { NotificationsPanel } from './NotificationsPanel';
import { ImportRatingsModal } from './ImportRatingsModal';
import { TMDBPopularSection } from './TMDBPopularSection';
import { CircleDetailsModal } from './CircleDetailsModal';
import { circleTheme } from './circle-theme';

type UserMap = Record<string, AppUserDto>;
type MainView = 'group' | 'watchlist' | 'rated' | 'friends' | 'circles' | 'tmdb';
type Tab = 'feed' | 'upcoming' | 'cowatched';
type CircleFilter = 'all' | 'private' | 'public';
type FriendsTab = 'friends' | 'pending' | 'circles';

const SHARING_LABEL: Record<RatingsShared, string> = {
  approved: 'Sharing all',
  selective: 'Sharing some',
  none: 'Private',
};

export function AppShell() {
  const { user, ready, signOut } = useRequireAuth();
  const { isDark, toggle: toggleTheme } = useTheme();

  const [circleList, setCircleList] = useState<CircleDto[]>([]);
  const [activeCircleId, setActiveCircleId] = useState<string | null>(null);
  const [userMap, setUserMap] = useState<UserMap>({});
  const [feed, setFeed] = useState<FeedItemDto[]>([]);
  const [outings, setOutings] = useState<OutingDto[]>([]);
  const [movieCache, setMovieCache] = useState<Record<number, MovieDto>>({});
  const [myRatings, setMyRatings] = useState<RatingDto[]>([]);
  const [watchlistEntries, setWatchlistEntries] = useState<WatchlistEntryDto[]>([]);
  const [friendUsers, setFriendUsers] = useState<AppUserDto[]>([]);
  const [friendRels, setFriendRels] = useState<FriendRelationshipDto[]>([]);
  const [unread, setUnread] = useState(0);

  const [mainView, setMainView] = useState<MainView>('group');
  const [tab, setTab] = useState<Tab>('feed');
  const [friendsTab, setFriendsTab] = useState<FriendsTab>('friends');
  const [openMovie, setOpenMovie] = useState<MovieDto | null>(null);
  const [circleForm, setCircleForm] = useState<{ mode: 'create' | 'edit'; circle?: CircleDto } | null>(null);
  const [detailsCircle, setDetailsCircle] = useState<CircleDto | null>(null);
  const [confirmDeleteCircle, setConfirmDeleteCircle] = useState<CircleDto | null>(null);
  const [deletingCircle, setDeletingCircle] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<AppUserDto[]>([]);
  const [circleFilter, setCircleFilter] = useState<CircleFilter>('all');
  const [circleQuery, setCircleQuery] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [confirmRemoveFriend, setConfirmRemoveFriend] = useState<AppUserDto | null>(null);
  const [inviteToCircleUser, setInviteToCircleUser] = useState<AppUserDto | null>(null);
  const [expandedFriend, setExpandedFriend] = useState<string | null>(null);

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
    setFriendRels(rels);

    // Collect all friend user IDs (any relationship status).
    const friendIds = new Set<string>();
    rels.forEach((r) => {
      const otherId = r.user_id === user?.user_id ? r.other_id : r.user_id;
      friendIds.add(otherId);
    });

    // Resolve profiles for friend IDs not already in userMap.
    const unknownIds = [...friendIds].filter((id) => !userMap[id]);
    if (unknownIds.length > 0) {
      // Use search to resolve each unknown user. In practice there are few.
      const resolved = await Promise.all(
        unknownIds.map((id) =>
          friendsApi.search(id).catch(() => [] as AppUserDto[]),
        ),
      );
      const found = resolved.flat();
      if (found.length > 0) mergeUsers(found);
    }

    // Build friendUsers from the resolved userMap + any newly resolved users.
    // We need to re-read userMap after mergeUsers, so use a callback:
    setFriendUsers(() => {
      // Read the latest userMap (mergeUsers may have just updated it).
      const currentMap = { ...userMap };
      // Also include users resolved above that aren't in the map yet.
      const allUsers: AppUserDto[] = [];
      for (const id of friendIds) {
        if (currentMap[id]) allUsers.push(currentMap[id]);
      }
      return allUsers;
    });
  }, [user, userMap, mergeUsers]);

  // Re-derive friendUsers when userMap changes (circle members load async).
  useEffect(() => {
    if (friendRels.length === 0) return;
    const friendIds = new Set<string>();
    friendRels.forEach((r) => {
      const otherId = r.user_id === user?.user_id ? r.other_id : r.user_id;
      friendIds.add(otherId);
    });
    setFriendUsers(
      [...friendIds]
        .map((id) => userMap[id])
        .filter((u): u is AppUserDto => !!u),
    );
  }, [friendRels, userMap, user]);

  const runSearch = async (q: string) => {
    setSearch(q);
    if (q.trim().length < 2) return setSearchResults([]);
    const res = await friendsApi.search(q.trim()).catch(() => []);
    mergeUsers(res);
    setSearchResults(res);
  };

  const addFriend = async (id: string) => {
    await friendsApi.request(id).catch(() => {});
    // Refresh to pick up the new relationship.
    await refreshFriends();
  };

  const acceptFriend = async (otherId: string) => {
    await friendsApi.accept(otherId).catch(() => {});
    await refreshFriends();
  };

  const removeFriend = async (otherId: string) => {
    await friendsApi.remove(otherId).catch(() => {});
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      next.delete(otherId);
      return next;
    });
    setConfirmRemoveFriend(null);
    await refreshFriends();
  };

  const toggleFriendSelect = (id: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const inviteToCircle = async (circleId: string, userId: string) => {
    const circle = circleList.find((c) => c.group_id === circleId);
    if (!circle) return;
    const currentMemberIds = circle.members.map((m) => m.user_id);
    if (currentMemberIds.includes(userId)) return; // already a member
    try {
      const updated = await circlesApi.update(circleId, {
        member_ids: [...currentMemberIds, userId],
      });
      setCircleList((prev) =>
        prev.map((c) => (c.group_id === updated.group_id ? updated : c)),
      );
      setInviteToCircleUser(null);
    } catch {
      /* error handling — leave modal open */
    }
  };

  const coWatched = useMemo(() => feed.filter((f) => f.co_watched), [feed]);
  const friendCandidates = useMemo(
    () => Object.values(userMap).filter((u) => u.user_id !== user?.user_id),
    [userMap, user],
  );
  const watchlistIds = useMemo(
    () => new Set(watchlistEntries.map((w) => w.movie_tmdb_id)),
    [watchlistEntries],
  );
  const friendIdSet = useMemo(
    () => new Set(friendUsers.map((f) => f.user_id)),
    [friendUsers],
  );
  const acceptedFriends = useMemo(
    () => {
      const acceptedIds = new Set<string>();
      friendRels.forEach((r) => {
        if (r.status === 'friends') {
          acceptedIds.add(r.user_id === user?.user_id ? r.other_id : r.user_id);
        }
      });
      return friendUsers.filter((u) => acceptedIds.has(u.user_id));
    },
    [friendRels, friendUsers, user],
  );
  const pendingIncoming = useMemo(
    () => {
      const ids = new Set<string>();
      friendRels.forEach((r) => {
        if (r.status === 'requested_by_them') {
          ids.add(r.user_id === user?.user_id ? r.other_id : r.user_id);
        }
      });
      return friendUsers.filter((u) => ids.has(u.user_id));
    },
    [friendRels, friendUsers, user],
  );
  const pendingOutgoing = useMemo(
    () => {
      const ids = new Set<string>();
      friendRels.forEach((r) => {
        if (r.status === 'requested_by_me') {
          ids.add(r.user_id === user?.user_id ? r.other_id : r.user_id);
        }
      });
      return friendUsers.filter((u) => ids.has(u.user_id));
    },
    [friendRels, friendUsers, user],
  );
  const sharedCirclesFor = useCallback(
    (userId: string): CircleDto[] =>
      circleList.filter((c) =>
        c.members.some((m) => m.user_id === userId) &&
        c.members.some((m) => m.user_id === user?.user_id),
      ),
    [circleList, user],
  );
  const pendingCount = pendingIncoming.length + pendingOutgoing.length;
  const ratedScores = useMemo(
    () => Object.fromEntries(myRatings.map((r) => [r.movie_tmdb_id, r.score])),
    [myRatings],
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
          ? 'bg-orange-50 dark:bg-slate-800 text-orange-600 dark:text-white font-bold'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50 font-medium',
      )}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <div className="contents">
      <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0B] text-slate-900 dark:text-slate-100 font-sans flex overflow-hidden relative transition-colors duration-200">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-orange-500/20 dark:bg-orange-600/10 blur-[128px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-500/20 dark:bg-indigo-600/10 blur-[128px] rounded-full pointer-events-none" />

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed md:static inset-y-0 left-0 z-50 w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1A1A1D] flex flex-col flex-shrink-0 transition-transform duration-300',
            mobileNav ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          )}
        >
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3 text-slate-900 dark:text-white font-bold text-xl tracking-tight">
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
            <div className="text-xs font-mono text-slate-500 uppercase tracking-wider px-2 mb-3">Database</div>
            <button
              onClick={() => { setMainView('tmdb'); setMobileNav(false); }}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-sm',
                mainView === 'tmdb'
                  ? 'bg-orange-50 dark:bg-slate-800 text-orange-600 dark:text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50 font-medium',
              )}
            >
              <span className="flex items-center gap-3">
                <Database className="w-4 h-4 text-orange-500" /> TMDB Popular
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-500 text-[10px] font-mono font-bold">25</span>
            </button>
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
                    ? 'bg-orange-50 dark:bg-slate-800/80 text-orange-900 dark:text-white border-orange-200 dark:border-slate-700/50'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50',
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

          <div className="p-4 border-t border-slate-200 dark:border-slate-800/50">
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar user={user} size="md" />
              <div className="flex flex-col items-start leading-tight flex-1">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-200">{user.display_name}</span>
                <span className="text-[10px] text-slate-500">@{user.handle}</span>
              </div>
              <button onClick={signOut} title="Sign out" className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
          <header className="flex-shrink-0 h-16 md:h-20 px-4 md:px-8 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0A0A0B]/80 backdrop-blur-xl z-10">
            <div className="flex items-center gap-4">
              <button className="md:hidden text-slate-500" onClick={() => setMobileNav(true)}>
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-lg md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                {mainView === 'group' && (
                  <>
                    <span className="text-orange-600 dark:text-orange-500">{activeCircle?.name ?? 'Circle'}</span>
                    {myMembership && (
                      <button
                        onClick={cycleSharing}
                        title="Change your rating sharing"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#1A1A1D] border border-slate-200 dark:border-slate-800 text-[10px] md:text-xs font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest hover:border-orange-500 transition-colors"
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
                {mainView === 'tmdb' && (
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-orange-500" /> TMDB Popular
                  </span>
                )}
              </h1>
            </div>
            <div className="flex items-center gap-3 md:gap-4">
              {mainView === 'group' && activeCircle && (
                <div className="hidden md:flex -space-x-2">
                  {activeCircle.members.map((m) => {
                    const u = userMap[m.user_id];
                    return u ? <Avatar key={m.user_id} user={u} size="md" ring /> : null;
                  })}
                </div>
              )}
              <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
              <button
                onClick={toggleTheme}
                title={isDark ? 'Switch to light' : 'Switch to dark'}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button onClick={() => setShowNotifs(true)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white relative">
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-orange-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
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
                {mainView === 'tmdb' && renderTmdb()}
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
      {detailsCircle && (
        <CircleDetailsModal
          circle={detailsCircle}
          onClose={() => setDetailsCircle(null)}
          onOpenFeed={(c) => {
            setDetailsCircle(null);
            setActiveCircleId(c.group_id);
            setMainView('group');
          }}
          onOpenMovie={(c, m) => {
            setDetailsCircle(null);
            setActiveCircleId(c.group_id);
            setOpenMovie(m);
          }}
          onEdit={(c) => {
            setDetailsCircle(null);
            setCircleForm({ mode: 'edit', circle: c });
          }}
          onDelete={(c) => {
            setDetailsCircle(null);
            setConfirmDeleteCircle(c);
          }}
        />
      )}
      {circleForm && (
        <CircleFormModal
          mode={circleForm.mode}
          circle={circleForm.circle}
          candidates={friendCandidates}
          currentUserId={user.user_id}
          preSelectedIds={circleForm.mode === 'create' && selectedFriends.size > 0 ? [...selectedFriends] : undefined}
          onClose={() => setCircleForm(null)}
          onSaved={(c) => {
            setCircleList((prev) =>
              prev.some((x) => x.group_id === c.group_id)
                ? prev.map((x) => (x.group_id === c.group_id ? c : x))
                : [...prev, c],
            );
            if (circleForm.mode === 'create') {
              setActiveCircleId(c.group_id);
              setMainView('group');
              setSelectedFriends(new Set());
            }
            setCircleForm(null);
          }}
        />
      )}
      {confirmDeleteCircle && (
        <ConfirmModal
          title="Delete this circle?"
          body={`"${confirmDeleteCircle.name}" and its outings, chat, and co-watch history will be removed for everyone. This can't be undone.`}
          confirmLabel="Delete circle"
          busy={deletingCircle}
          onCancel={() => setConfirmDeleteCircle(null)}
          onConfirm={async () => {
            const target = confirmDeleteCircle;
            setDeletingCircle(true);
            try {
              await circlesApi.remove(target.group_id);
              setCircleList((prev) => prev.filter((x) => x.group_id !== target.group_id));
              setActiveCircleId((prev) => {
                if (prev !== target.group_id) return prev;
                const next = circleList.find((x) => x.group_id !== target.group_id);
                return next?.group_id ?? null;
              });
              setConfirmDeleteCircle(null);
            } catch {
              /* leave dialog open so the user can retry */
            } finally {
              setDeletingCircle(false);
            }
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
      <motion.div key="friends" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
        {/* Search bar */}
        <div className="bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-3xl p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-orange-500" /> Find Friends
          </h2>
          <div className="relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search by @handle or name"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Search Results</h3>
              {searchResults.map((u) => {
                const isFriend = friendIdSet.has(u.user_id);
                return (
                  <div key={u.user_id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-3">
                      <Avatar user={u} size="md" />
                      <div>
                        <div className="font-bold text-sm">{u.display_name}</div>
                        <div className="text-xs text-slate-500">@{u.handle}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => addFriend(u.user_id)}
                      disabled={isFriend}
                      className={cn(
                        'px-4 py-1.5 border rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5',
                        isFriend
                          ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-orange-500 hover:text-white hover:border-orange-500',
                      )}
                    >
                      {isFriend ? (<><Check className="w-3 h-3" /> Friends</>) : (<><UserPlus className="w-3 h-3" /> Add</>)}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sub-tabs: Friends | Pending | Circles */}
        <div className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-800">
          {([
            { id: 'friends' as const, label: `Friends (${acceptedFriends.length})`, icon: Users },
            { id: 'pending' as const, label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: Clock },
            { id: 'circles' as const, label: `Circles (${circleList.length})`, icon: Users },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setFriendsTab(t.id)}
              className={cn(
                'pb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider relative whitespace-nowrap',
                friendsTab === t.id
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
              )}
            >
              <t.icon className="w-4 h-4" /> {t.label}
              {t.id === 'pending' && pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold">{pendingCount}</span>
              )}
              {friendsTab === t.id && (
                <motion.div layoutId="friendTabInd" className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
              )}
            </button>
          ))}
        </div>

        {/* Friends sub-tab */}
        {friendsTab === 'friends' && (
          <div className="space-y-4">
            {/* Selection action bar */}
            {selectedFriends.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 flex items-center justify-between"
              >
                <span className="text-sm font-bold text-orange-500">
                  {selectedFriends.size} friend{selectedFriends.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedFriends(new Set())}
                    className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-xl transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => {
                      setCircleForm({ mode: 'create' });
                    }}
                    className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Create Circle
                  </button>
                </div>
              </motion.div>
            )}

            {acceptedFriends.length === 0 ? (
              <EmptyState icon={Users} title="No friends yet" body="Search for people above to send friend requests." />
            ) : (
              acceptedFriends.map((u) => {
                const isSelected = selectedFriends.has(u.user_id);
                const isExpanded = expandedFriend === u.user_id;
                const shared = sharedCirclesFor(u.user_id);
                return (
                  <div key={u.user_id} className="bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all hover:border-slate-300 dark:hover:border-slate-700">
                    <div className="flex items-center gap-3 p-4">
                      {/* Selection checkbox */}
                      <button
                        onClick={() => toggleFriendSelect(u.user_id)}
                        className={cn(
                          'w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors',
                          isSelected
                            ? 'bg-orange-500 border-orange-500'
                            : 'border-slate-300 dark:border-slate-700 hover:border-orange-400',
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <Avatar user={u} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{u.display_name}</div>
                        <div className="text-xs text-slate-500">@{u.handle}</div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => setInviteToCircleUser(u)}
                          title="Invite to circle"
                          className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-xl transition-colors"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmRemoveFriend(u)}
                          title="Remove friend"
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setExpandedFriend(isExpanded ? null : u.user_id)}
                          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {/* Expanded: shared circles */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                            <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest mb-2">Shared Circles</h4>
                            {shared.length === 0 ? (
                              <p className="text-xs text-slate-500">No shared circles yet.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {shared.map((c) => (
                                  <button
                                    key={c.group_id}
                                    onClick={() => { setActiveCircleId(c.group_id); setMainView('group'); }}
                                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-orange-500 hover:text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                                  >
                                    <Users className="w-3 h-3" /> {c.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}

            {/* Invite link */}
            <div className="bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Your invite link</h3>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-50 dark:bg-slate-900 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 font-mono text-sm truncate">
                  filmrave.app/add/@{user!.handle}
                </code>
                <button
                  onClick={() => navigator.clipboard?.writeText(`filmrave.app/add/@${user!.handle}`)}
                  className="px-4 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-500 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pending sub-tab */}
        {friendsTab === 'pending' && (
          <div className="space-y-6">
            {/* Incoming */}
            {pendingIncoming.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" /> Incoming Requests
                </h3>
                <div className="space-y-2">
                  {pendingIncoming.map((u) => (
                    <div key={u.user_id} className="flex items-center justify-between p-4 bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <Avatar user={u} size="md" />
                        <div>
                          <div className="font-bold text-sm">{u.display_name}</div>
                          <div className="text-xs text-slate-500">@{u.handle}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => acceptFriend(u.user_id)}
                          className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => removeFriend(u.user_id)}
                          className="px-4 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-500 hover:border-red-500 text-xs font-bold rounded-xl transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Outgoing */}
            {pendingOutgoing.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Outgoing Requests
                </h3>
                <div className="space-y-2">
                  {pendingOutgoing.map((u) => (
                    <div key={u.user_id} className="flex items-center justify-between p-4 bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <Avatar user={u} size="md" />
                        <div>
                          <div className="font-bold text-sm">{u.display_name}</div>
                          <div className="text-xs text-slate-500">@{u.handle}</div>
                        </div>
                      </div>
                      <span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-bold rounded-xl flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
              <EmptyState icon={Clock} title="No pending requests" body="Friend requests you send or receive will show up here." />
            )}
          </div>
        )}

        {/* Circles quick-access sub-tab */}
        {friendsTab === 'circles' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Your Circles</h3>
              <button
                onClick={() => setCircleForm({ mode: 'create' })}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3 h-3" /> New Circle
              </button>
            </div>
            {circleList.length === 0 ? (
              <EmptyState icon={Users} title="No circles yet" body="Create your first circle to start sharing movie ratings with friends." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {circleList.map((c) => {
                  const t = circleTheme(c);
                  return (
                    <div key={c.group_id} className="bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                      <div className={cn('p-4 bg-gradient-to-r text-white', t.banner)}>
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm truncate">{c.name}</h4>
                          <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded-full">{c.members.length} members</span>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex -space-x-2">
                          {c.members.slice(0, 4).map((m) => {
                            const u = userMap[m.user_id];
                            return u ? <Avatar key={m.user_id} user={u} size="sm" ring /> : null;
                          })}
                          {c.members.length > 4 && (
                            <span className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300 border-2 border-white dark:border-[#141417]">+{c.members.length - 4}</span>
                          )}
                        </div>
                        <button
                          onClick={() => { setActiveCircleId(c.group_id); setMainView('group'); }}
                          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-orange-500 hover:text-white text-xs font-bold rounded-xl transition-colors"
                        >
                          Open Feed
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Confirm remove friend modal */}
        {confirmRemoveFriend && (
          <ConfirmModal
            title="Remove friend?"
            body={`Remove ${confirmRemoveFriend.display_name} from your friends? They will not be removed from any shared circles.`}
            confirmLabel="Remove"
            onCancel={() => setConfirmRemoveFriend(null)}
            onConfirm={() => removeFriend(confirmRemoveFriend.user_id)}
          />
        )}

        {/* Invite to circle modal */}
        {inviteToCircleUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setInviteToCircleUser(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative w-full max-w-sm bg-white dark:bg-[#1A1A1D] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Send className="w-4 h-4 text-orange-500" /> Invite {inviteToCircleUser.display_name}
                </h2>
                <button onClick={() => setInviteToCircleUser(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-2 max-h-64 overflow-y-auto">
                {circleList.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No circles to invite to. Create one first.</p>
                ) : (
                  circleList.map((c) => {
                    const alreadyMember = c.members.some((m) => m.user_id === inviteToCircleUser.user_id);
                    return (
                      <button
                        key={c.group_id}
                        disabled={alreadyMember}
                        onClick={() => inviteToCircle(c.group_id, inviteToCircleUser.user_id)}
                        className={cn(
                          'w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left',
                          alreadyMember
                            ? 'border-slate-200 dark:border-slate-800 opacity-50 cursor-not-allowed'
                            : 'border-slate-200 dark:border-slate-800 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10',
                        )}
                      >
                        <div>
                          <div className="font-bold text-sm">{c.name}</div>
                          <div className="text-[10px] text-slate-500">{c.members.length} members</div>
                        </div>
                        {alreadyMember ? (
                          <span className="text-[10px] font-bold text-slate-400">Already in</span>
                        ) : (
                          <span className="text-[10px] font-bold text-orange-500">Invite →</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    );
  }

  function renderTmdb() {
    return (
      <motion.div key="tmdb" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <TMDBPopularSection
          watchlistIds={watchlistIds}
          ratedScores={ratedScores}
          onChanged={refreshLibrary}
          onPlanParty={planParty}
        />
      </motion.div>
    );
  }

  /** Create a watch-party outing for a movie in the active (or first) circle. */
  async function planParty(movie: MovieDto) {
    if (movie.tmdb_id == null) return;
    const circleId = activeCircleId ?? circleList[0]?.group_id;
    if (!circleId) {
      // No circle to attach the outing to — send the user to create one first.
      setCircleForm({ mode: 'create' });
      return;
    }
    try {
      await outingsApi.create(circleId, { movie_tmdb_id: movie.tmdb_id });
    } catch {
      return;
    }
    setActiveCircleId(circleId);
    setMainView('group');
    setTab('upcoming');
    const [os] = await Promise.all([outingsApi.list(circleId).catch(() => outings)]);
    setOutings(os);
    hydrateMovies(os.map((o) => o.movie_tmdb_id));
  }

  function renderCircles() {
    const allMemberIds = new Set(circleList.flatMap((c) => c.members.map((m) => m.user_id)));
    const q = circleQuery.trim().toLowerCase();
    const visible = circleList.filter((c) => {
      const t = circleTheme(c);
      const matches =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        t.genre.toLowerCase().includes(q);
      if (circleFilter === 'private') return matches && t.privacy === 'Private';
      if (circleFilter === 'public') return matches && t.privacy === 'Public';
      return matches;
    });

    return (
      <motion.div key="circles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
        {/* Analytics banner */}
        <div className="bg-gradient-to-br from-slate-900 via-[#16161D] to-slate-950 border border-slate-800 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-2xl">
          <div className="absolute -top-10 -right-10 w-64 h-64 bg-orange-500/10 blur-[90px] rounded-full pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-indigo-500/10 blur-[90px] rounded-full pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 uppercase tracking-wider">
                  <Award className="w-3.5 h-3.5" /> Your Circles
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black italic tracking-tight uppercase">Movie Circles Overview</h2>
              <p className="text-slate-400 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
                Every squad is a private <strong className="text-white">Movie Circle</strong> where you share ratings on your terms, plan outings, and talk films.
              </p>
            </div>
            <button
              onClick={() => setCircleForm({ mode: 'create' })}
              className="px-6 py-3.5 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-600/30 shrink-0"
            >
              <Plus className="w-4 h-4" /> Create New Circle
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800/80">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-0.5">Active Circles</span>
              <span className="text-2xl font-black text-white">{circleList.length}</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-0.5">Total Members</span>
              <span className="text-2xl font-black text-orange-400">{allMemberIds.size}</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-0.5">Access Types</span>
              <span className="text-xs font-bold text-slate-200 mt-1 block">Private &amp; Public</span>
            </div>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={circleQuery}
              onChange={(e) => setCircleQuery(e.target.value)}
              placeholder="Search circles by name or genre…"
              className="w-full bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {([
              { id: 'all', label: `All (${circleList.length})`, icon: undefined },
              { id: 'private', label: 'Private', icon: Lock },
              { id: 'public', label: 'Public', icon: Globe },
            ] as const).map((f) => {
              const selected = circleFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setCircleFilter(f.id)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap border',
                    selected
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                      : 'bg-white dark:bg-[#141417] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300',
                  )}
                >
                  {f.icon && <f.icon className="w-3.5 h-3.5" />}
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Circle cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((c) => {
            const t = circleTheme(c);
            return (
              <div
                key={c.group_id}
                className="bg-white dark:bg-[#141417] border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-lg flex flex-col"
              >
                <div className={cn('p-5 bg-gradient-to-r text-white relative', t.banner)}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 border border-white/20">
                      <Film className="w-3 h-3" /> {t.genre}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 border border-white/20">
                      {t.privacy === 'Private' ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                      {t.privacy}
                    </span>
                  </div>
                  <h3 className="text-xl font-black italic tracking-tight uppercase leading-tight line-clamp-1">{c.name}</h3>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed line-clamp-2">
                    {c.description || 'A movie-loving circle of friends.'}
                  </p>
                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          {c.members.slice(0, 5).map((m) => {
                            const u = userMap[m.user_id];
                            return u ? <Avatar key={m.user_id} user={u} size="sm" ring className="border-white dark:border-[#141417]" /> : null;
                          })}
                        </div>
                        <span className="text-[11px] font-bold text-slate-500 font-mono">{c.members.length} members</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDetailsCircle(c)}
                      className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-orange-500 hover:text-white text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs transition-colors text-center"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => { setActiveCircleId(c.group_id); setMainView('group'); }}
                      className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-xl text-xs transition-colors text-center"
                    >
                      Open Feed
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          <button
            onClick={() => setCircleForm({ mode: 'create' })}
            className="border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-orange-500 rounded-3xl p-6 flex flex-col items-center justify-center text-slate-500 hover:text-orange-500 hover:bg-orange-500/5 transition-all min-h-[220px]"
          >
            <div className="w-12 h-12 rounded-full bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center text-orange-500 mb-3">
              <Plus className="w-6 h-6" />
            </div>
            <span className="font-extrabold uppercase tracking-wider text-xs">Create New Movie Circle</span>
          </button>
        </div>
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

/* FriendList component removed — functionality is now inline in renderFriends(). */
