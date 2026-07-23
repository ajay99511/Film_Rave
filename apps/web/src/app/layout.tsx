import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FilmRave — Rate films with your circles',
  description:
    'FilmRave lets movie-loving friends share ratings on their terms, plan outings, and chat about films — privacy-first, circle by circle.',
  openGraph: {
    title: 'FilmRave',
    description:
      'Share ratings with your circles, plan cinema outings, and talk films.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
