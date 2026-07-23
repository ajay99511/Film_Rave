import { SiteNav } from '@/components/marketing/SiteNav';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-marquee-border py-8 text-center text-sm text-marquee-muted">
        FilmRave — privacy-first movie clubs.
      </footer>
    </div>
  );
}
