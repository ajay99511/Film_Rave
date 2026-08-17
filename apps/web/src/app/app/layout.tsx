'use client';

import { SessionProvider } from '@/lib/session';
import { ThemeProvider } from '@/lib/theme';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}
