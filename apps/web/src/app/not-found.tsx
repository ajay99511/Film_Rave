import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-semibold text-marquee-amber">404</h1>
      <p className="text-marquee-muted">
        We couldn&apos;t find that page or profile.
      </p>
      <Link href="/" className="text-sm text-marquee-teal hover:underline">
        Back to home
      </Link>
    </main>
  );
}
