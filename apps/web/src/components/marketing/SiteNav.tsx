'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clapperboard } from 'lucide-react';
import { session } from '@/lib/client';
import { cn } from '@/lib/ui';

const links = [
  { href: '/about', label: 'How it works' },
  { href: '/download', label: 'Get the app' },
];

/**
 * Marketing-site header. Session-aware: once mounted it checks the stored
 * session and swaps the CTA between "Sign in" and "Open the app". Rendered
 * only on (marketing) routes — /login and /app own their full-screen chrome.
 */
export function SiteNav() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(session.access && session.user));
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-marquee-border bg-black/60 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-marquee-amber text-black">
            <Clapperboard className="h-5 w-5" />
          </span>
          FilmRave
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'rounded-full px-3 py-2 text-sm transition hover:text-marquee-amber',
                pathname === l.href ? 'text-marquee-amber' : 'text-marquee-muted',
              )}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href={signedIn ? '/app' : '/login'}
            className="ml-2 rounded-full bg-marquee-amber px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
          >
            {signedIn ? 'Open the app' : 'Sign in'}
          </Link>
        </div>
      </nav>
    </header>
  );
}
