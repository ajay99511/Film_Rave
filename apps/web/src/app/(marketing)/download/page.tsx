import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Get FilmRave',
  description: 'Download FilmRave for iOS, Android, and desktop.',
};

const platforms = [
  { name: 'iOS', note: 'App Store — coming soon' },
  { name: 'Android', note: 'Google Play — coming soon' },
  { name: 'Desktop', note: 'Windows & macOS — coming soon' },
];

export default function Download() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold">Get FilmRave</h1>
      <p className="text-marquee-muted">
        One app across mobile and desktop, built with Flutter.
      </p>
      <ul className="w-full space-y-3">
        {platforms.map((p) => (
          <li
            key={p.name}
            className="flex items-center justify-between rounded-xl border border-marquee-border bg-marquee-surface px-5 py-4"
          >
            <span className="font-medium">{p.name}</span>
            <span className="text-sm text-marquee-muted">{p.note}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/login"
        className="rounded-full bg-marquee-amber px-6 py-3 font-medium text-black transition hover:opacity-90"
      >
        Use the web app now
      </Link>
      <Link href="/" className="text-sm text-marquee-teal hover:underline">
        Back to home
      </Link>
    </main>
  );
}
