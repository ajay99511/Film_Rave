'use client';

import { useEffect, useState } from 'react';
import type { PublicOutingDto, RsvpStatus } from '@filmrave/shared';
import { ApiError, session } from '@/lib/client-core';
import {
  claimPublicOuting,
  getPublicOuting,
  rsvpPublicOuting,
  voteNightPublicOuting,
} from '@/lib/public-outing';

const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: "I'm going",
  maybe: 'Maybe',
  cant_go: "Can't go",
};

export function GuestOutingActions({
  slug,
  initialOuting,
}: {
  slug: string;
  initialOuting: PublicOutingDto;
}) {
  const [outing, setOuting] = useState(initialOuting);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The SSR read has no request context to inspect a returning guest's
  // cookie (http mode) or localStorage (local mode — SSR has none at all).
  // Reconcile once mounted in the browser, where both are visible.
  useEffect(() => {
    getPublicOuting(slug)
      .then(setOuting)
      .catch(() => {
        /* keep the SSR snapshot on failure */
      });
  }, [slug]);

  // Best-effort: if the visitor is already signed in (arrived here after
  // converting, or already had an account) and still holds a guest cookie
  // for this outing, link the two. Safe to attempt blindly — the server
  // no-ops for a missing/already-claimed-by-self token.
  useEffect(() => {
    if (!session.access) return;
    claimPublicOuting(slug, session.access, session.user?.user_id).catch(() => {
      /* nothing to claim, or already claimed — not user-facing */
    });
  }, [slug]);

  const locked = outing.locked;
  const hasAnswered = outing.my_guest_status != null;

  const submitRsvp = async (status: RsvpStatus) => {
    if (!hasAnswered && !name.trim()) {
      setError('Enter your name first');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await rsvpPublicOuting(slug, {
        display_name: name.trim() || outing.attendees_going.find((a) => a.is_guest)?.display_name || 'Guest',
        status,
      });
      setOuting(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const submitNightVote = async (optionId: string) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await voteNightPublicOuting(slug, optionId);
      setOuting(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-marquee-muted">
            Who&apos;s going
          </h2>
          <span className="text-xs text-marquee-muted">
            {outing.attendees_going.length} going
          </span>
        </div>
        {outing.attendees_going.length === 0 ? (
          <p className="text-sm text-marquee-muted">Nobody yet — be the first.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {outing.attendees_going.map((a, i) => (
              <li
                key={`${a.display_name}-${i}`}
                className="rounded-full bg-marquee-surface px-3 py-1 text-sm"
              >
                {a.display_name}
                {a.is_guest && <span className="text-marquee-muted"> (guest)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!locked && (
        <section className="space-y-3">
          {!hasAnswered && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={40}
              className="w-full rounded-lg border border-marquee-border bg-marquee-surface px-4 py-2 text-sm outline-none focus:border-marquee-amber"
            />
          )}
          <div className="flex gap-2">
            {(['going', 'maybe', 'cant_go'] as RsvpStatus[]).map((s) => (
              <button
                key={s}
                disabled={busy}
                onClick={() => void submitRsvp(s)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
                  outing.my_guest_status === s
                    ? 'bg-marquee-amber text-black'
                    : 'bg-marquee-surface hover:bg-marquee-border'
                }`}
              >
                {RSVP_LABELS[s]}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </section>
      )}

      {outing.night_options.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-marquee-muted">
            Which night?
          </h2>
          <div className="space-y-2">
            {outing.night_options.map((o) => (
              <button
                key={o.option_id}
                disabled={busy || locked || !hasAnswered}
                onClick={() => void submitNightVote(o.option_id)}
                className={`flex w-full items-center justify-between rounded-lg px-4 py-2 text-sm transition disabled:opacity-60 ${
                  outing.my_guest_night_vote === o.option_id
                    ? 'bg-marquee-amber text-black'
                    : 'bg-marquee-surface hover:bg-marquee-border'
                }`}
              >
                <span>{o.label}</span>
                <span className="text-xs">{o.vote_count} votes</span>
              </button>
            ))}
          </div>
          {!hasAnswered && (
            <p className="mt-1 text-xs text-marquee-muted">RSVP above to vote on a night.</p>
          )}
        </section>
      )}

      {outing.theater_options.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-marquee-muted">
            Theater options
          </h2>
          <ul className="space-y-1 text-sm text-marquee-muted">
            {outing.theater_options.map((o) => (
              <li key={o.option_id} className="flex justify-between">
                <span>{o.label}</span>
                <span>{o.vote_count} votes</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Post-outing conversion CTA. Outing.status never reliably transitions
          to 'done' in the current codebase (no scheduler/cron writes it), so
          this can't gate on status/date as originally sketched — it shows
          once the visitor has RSVP'd at all, which is the simplest signal
          that's actually available. See docs/plans/f06-guest-outing-page.md
          §9 (deviation recorded there too). */}
      {hasAnswered && (
        <section className="rounded-lg border border-marquee-border bg-marquee-surface px-4 py-3 text-sm">
          <p className="mb-2 text-marquee-muted">
            Want to keep a record of what you watch and rate?
          </p>
          <a
            href={`/login?returnTo=${encodeURIComponent(`/o/${slug}`)}`}
            className="inline-block rounded-full bg-marquee-amber px-4 py-2 font-medium text-black hover:opacity-90"
          >
            Create your free account
          </a>
        </section>
      )}
    </div>
  );
}
