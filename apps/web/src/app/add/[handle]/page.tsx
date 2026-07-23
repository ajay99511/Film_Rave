import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApiError, getUserByHandle } from '@/lib/api';
import { AddFriendActions } from './AddFriendActions';

interface PageProps {
  params: Promise<{ handle: string }>;
}

// SSR metadata so shared invite links render a rich preview (the reason this
// route lives in Next.js rather than the Flutter web app).
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle } = await params;
  try {
    const user = await getUserByHandle(handle);
    return {
      title: `Add ${user.display_name} on FilmRave`,
      description: `${user.display_name} (@${user.handle}) invited you to connect on FilmRave.`,
      openGraph: {
        title: `Add ${user.display_name} on FilmRave`,
        description: `@${user.handle} invited you to connect on FilmRave.`,
      },
    };
  } catch {
    return { title: 'FilmRave invite' };
  }
}

export default async function AddByHandle({ params }: PageProps) {
  const { handle } = await params;

  let user;
  try {
    user = await getUserByHandle(handle);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-marquee-surface text-3xl font-semibold text-marquee-amber">
        {user.display_name.charAt(0).toUpperCase()}
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{user.display_name}</h1>
        <p className="text-marquee-muted">@{user.handle}</p>
      </div>
      <p className="text-marquee-muted">
        wants to connect with you on FilmRave.
      </p>
      <AddFriendActions targetId={user.user_id} displayName={user.display_name} />
      <a href="/download" className="text-sm text-marquee-teal hover:underline">
        Prefer the app? Get it here
      </a>
    </main>
  );
}
