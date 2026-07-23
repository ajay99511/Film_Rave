import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How FilmRave works',
  description:
    'Circles, consent-based rating visibility, movie rooms, and outings — how FilmRave keeps film-sharing private and social.',
};

const steps = [
  {
    heading: '1. Form a circle',
    body: 'Invite the friends you actually talk films with. Each circle is separate — roster, chat, and sharing rules of its own.',
  },
  {
    heading: '2. Set your sharing',
    body: 'Per circle, choose to share all ratings, only selected titles, or none. The server never sends what you did not share.',
  },
  {
    heading: '3. Rate & discuss',
    body: 'Open a Movie Room to see the group average, rate on a 1–10 slider, and chat thread by thread.',
  },
  {
    heading: '4. Plan the outing',
    body: 'Turn a film into a plan: RSVP, vote on the theater, and lock a showtime together.',
  },
];

export default function About() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold">How it works</h1>
      <div className="mt-12 space-y-8">
        {steps.map((s) => (
          <section key={s.heading}>
            <h2 className="text-xl font-semibold text-marquee-amber">
              {s.heading}
            </h2>
            <p className="mt-2 text-marquee-muted">{s.body}</p>
          </section>
        ))}
      </div>
      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/login"
          className="rounded-full bg-marquee-amber px-6 py-3 font-medium text-black"
        >
          Open the web app
        </Link>
        <Link
          href="/download"
          className="rounded-full border border-marquee-border px-6 py-3 font-medium"
        >
          Get the mobile app
        </Link>
      </div>
    </main>
  );
}
