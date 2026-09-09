import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/client-core';
import { getPublicOuting } from '@/lib/public-outing';
import { GuestOutingActions } from './GuestOutingActions';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// SSR metadata so a link shared into WhatsApp/iMessage renders a rich
// preview: the movie's own poster is the OG image (no custom composited
// card this phase — see docs/plans/f06-guest-outing-page.md §Non-goals).
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const outing = await getPublicOuting(slug);
    const going = outing.attendees_going.length;
    const title = `Movie Night: ${outing.movie.title}`;
    const description = going
      ? `${going} ${going === 1 ? 'person is' : 'people are'} already going. RSVP on FilmRave.`
      : 'RSVP on FilmRave — no account needed.';
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: outing.movie.poster_url ? [outing.movie.poster_url] : undefined,
      },
    };
  } catch {
    return { title: 'FilmRave movie night' };
  }
}

export default async function PublicOutingPage({ params }: PageProps) {
  const { slug } = await params;

  let outing;
  try {
    outing = await getPublicOuting(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const { movie } = outing;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex gap-4">
        {movie.poster_url && (
          // eslint-disable-next-line @next/next/no-img-element -- external TMDB URL, no next/image domain config for this SSR-only public page
          <img
            src={movie.poster_url}
            alt={movie.title}
            className="h-36 w-24 shrink-0 rounded-lg object-cover"
          />
        )}
        <div>
          <p className="text-xs uppercase tracking-wide text-marquee-muted">
            Movie Night
          </p>
          <h1 className="text-2xl font-semibold">{movie.title}</h1>
          {movie.release_date && (
            <p className="text-sm text-marquee-muted">{movie.release_date}</p>
          )}
          {outing.group_hype != null && (
            <p className="mt-1 text-sm text-marquee-amber">
              Group hype: {outing.group_hype.toFixed(1)}/10
            </p>
          )}
        </div>
      </div>

      {outing.locked && (
        <div className="rounded-lg border border-marquee-border bg-marquee-surface px-4 py-3 text-sm text-marquee-muted">
          Planning is closed for this outing.
        </div>
      )}

      <GuestOutingActions slug={slug} initialOuting={outing} />

      <a
        href="/download"
        className="text-center text-sm text-marquee-teal hover:underline"
      >
        Prefer the app? Get it here
      </a>
    </main>
  );
}
