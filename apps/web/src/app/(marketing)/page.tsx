import Link from 'next/link';

const features = [
  {
    title: 'Ratings on your terms',
    body: 'Share all, some, or none of your scores with each circle. Unshared ratings never leave your device unrevealed — enforced server-side.',
  },
  {
    title: 'Circles, not one big feed',
    body: 'Different taste for different friends. Every circle has its own roster, chat, and shared-ratings settings.',
  },
  {
    title: 'Plan the outing',
    body: 'RSVP, vote on the theater, and settle on a showtime — right where you talk about the film.',
  },
];

export default function MarketingHome() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <header className="flex flex-col items-start gap-6">
        <span className="rounded-full border border-marquee-border px-3 py-1 text-sm text-marquee-teal">
          Midnight Marquee
        </span>
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
          Rate films with the friends who{' '}
          <span className="text-marquee-amber">get your taste.</span>
        </h1>
        <p className="max-w-2xl text-lg text-marquee-muted">
          FilmRave is a privacy-first movie club. Keep separate circles, share
          ratings on your own terms, plan cinema outings, and chat film by film.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/login"
            className="rounded-full bg-marquee-amber px-6 py-3 font-medium text-black transition hover:opacity-90"
          >
            Open the web app
          </Link>
          <Link
            href="/download"
            className="rounded-full border border-marquee-border px-6 py-3 font-medium transition hover:border-marquee-teal"
          >
            Get the mobile app
          </Link>
          <Link
            href="/about"
            className="rounded-full border border-marquee-border px-6 py-3 font-medium transition hover:border-marquee-teal"
          >
            How it works
          </Link>
        </div>
      </header>

      <section className="mt-24 grid gap-6 sm:grid-cols-3">
        {features.map((f) => (
          <article
            key={f.title}
            className="rounded-2xl border border-marquee-border bg-marquee-surface p-6"
          >
            <h2 className="text-lg font-semibold">{f.title}</h2>
            <p className="mt-3 text-sm text-marquee-muted">{f.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
