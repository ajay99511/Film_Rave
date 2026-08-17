/**
 * Dev seed: recreates the prototype's world so the web client renders real data
 * on first run. Five friends, one circle with contrasting sharing settings,
 * a catalog, ratings that exercise the visibility rule, and one fully-loaded
 * upcoming outing (hype + theater + night votes). Run: pnpm db:seed.
 *
 * Idempotent: safe to re-run. These seeded users exist to populate circles,
 * friends, ratings, and an outing — you sign in as your own account via Google
 * and can add/search these people as friends.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-purple-600',
  'bg-rose-600',
];

const PEOPLE = [
  { handle: 'ajay', displayName: 'Ajay' },
  { handle: 'sarah', displayName: 'Sarah' },
  { handle: 'mike', displayName: 'Mike' },
  { handle: 'emma', displayName: 'Emma' },
  { handle: 'david', displayName: 'David' },
];

const U = (id: string) =>
  `https://images.unsplash.com/photo-${id}?q=80&w=1200&auto=format&fit=crop`;

const MOVIES = [
  { tmdbId: 693134, title: 'Dune: Part Two', releaseDate: '2024-03-01', year: 2024, runtime: 166, posterUrl: U('1534447677768-be436bb09401'), overview: 'Paul Atreides unites with Chani and the Fremen on a warpath of revenge against the conspirators who destroyed his family.' },
  { tmdbId: 786892, title: 'Furiosa: A Mad Max Saga', releaseDate: '2024-05-24', year: 2024, runtime: 148, posterUrl: U('1536440136628-849c177e76a1'), overview: 'The origin story of renegade warrior Furiosa before her encounter and teamup with Mad Max.' },
  { tmdbId: 792307, title: 'Poor Things', releaseDate: '2023-12-08', year: 2023, runtime: 141, posterUrl: U('1518676590629-3dcbd9c5a5c9'), overview: 'The fantastical evolution of Bella Baxter, a young woman brought back to life by an unorthodox scientist.' },
  { tmdbId: 872585, title: 'Oppenheimer', releaseDate: '2023-07-21', year: 2023, runtime: 180, posterUrl: U('1543332164-6e82f355badc'), overview: 'The story of J. Robert Oppenheimer and his role in the development of the atomic bomb.' },
  { tmdbId: 414906, title: 'The Batman', releaseDate: '2022-03-04', year: 2022, runtime: 176, posterUrl: U('1509347528160-9a9e33742cdb'), overview: 'When a sadistic serial killer targets Gotham’s elite, Batman is forced to investigate the city’s corruption.' },
  { tmdbId: 533535, title: 'Deadpool & Wolverine', releaseDate: '2024-07-26', year: 2024, runtime: 128, posterUrl: U('1626814026160-2237a95fc5a0'), overview: 'Wolverine is recovering when he crosses paths with the loudmouth Deadpool. They team up to defeat a common enemy.' },
  { tmdbId: 945961, title: 'Alien: Romulus', releaseDate: '2024-08-16', year: 2024, runtime: 119, posterUrl: U('1605806616949-1e87b487cb2a'), overview: 'Young people from a distant world must face the most terrifying life form in the universe.' },
];

async function main(): Promise<void> {
  const users: Record<string, { id: string }> = {};
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    users[p.handle] = await prisma.user.upsert({
      where: { handle: p.handle },
      update: { avatarColor: COLORS[i] },
      create: {
        handle: p.handle,
        displayName: p.displayName,
        email: `${p.handle}@example.com`,
        googleId: `seed-${p.handle}`,
        avatarColor: COLORS[i],
      },
      select: { id: true },
    });
  }

  for (const m of MOVIES) {
    await prisma.movie.upsert({
      where: { tmdbId: m.tmdbId },
      update: { posterUrl: m.posterUrl, overview: m.overview },
      create: m,
    });
  }

  // One circle, "The Inner Five", with mixed sharing settings.
  const existing = await prisma.circle.findFirst({
    where: { name: 'The Inner Five' },
  });
  const circle =
    existing ??
    (await prisma.circle.create({
      data: {
        name: 'The Inner Five',
        description: 'Six friends, one popcorn cartel.',
        members: {
          create: [
            { userId: users.ajay.id, role: 'admin', ratingsShared: 'approved' },
            { userId: users.sarah.id, role: 'member', ratingsShared: 'approved' },
            { userId: users.mike.id, role: 'member', ratingsShared: 'selective', sharedMovieIds: [693134] },
            { userId: users.emma.id, role: 'member', ratingsShared: 'none' },
            { userId: users.david.id, role: 'member', ratingsShared: 'approved' },
          ],
        },
      },
    }));

  // Ratings across the catalog (exercise visibility: Mike selective, Emma none).
  const ratings: { handle: string; tmdbId: number; score: number }[] = [
    { handle: 'sarah', tmdbId: 693134, score: 10 },
    { handle: 'mike', tmdbId: 693134, score: 9 },
    { handle: 'ajay', tmdbId: 693134, score: 9 },
    { handle: 'emma', tmdbId: 786892, score: 8 },
    { handle: 'david', tmdbId: 786892, score: 8 },
    { handle: 'ajay', tmdbId: 872585, score: 10 },
    { handle: 'sarah', tmdbId: 414906, score: 9 },
    { handle: 'mike', tmdbId: 792307, score: 7 },
  ];
  for (const r of ratings) {
    await prisma.rating.upsert({
      where: {
        userId_movieTmdbId: { userId: users[r.handle].id, movieTmdbId: r.tmdbId },
      },
      update: { score: r.score },
      create: {
        userId: users[r.handle].id,
        movieTmdbId: r.tmdbId,
        score: r.score,
        ratedAt: new Date(),
      },
    });
  }

  // Watchlist for Ajay.
  for (const tmdbId of [945961, 792307]) {
    await prisma.watchlistEntry.upsert({
      where: { userId_movieTmdbId: { userId: users.ajay.id, movieTmdbId: tmdbId } },
      update: {},
      create: { userId: users.ajay.id, movieTmdbId: tmdbId },
    });
  }

  // A group co-watch (Co-Watched tab).
  await prisma.groupWatch.upsert({
    where: { circleId_movieTmdbId: { circleId: circle.id, movieTmdbId: 693134 } },
    update: {},
    create: { circleId: circle.id, movieTmdbId: 693134, watchedDate: '2024-03-05' },
  });

  // The flagship upcoming outing: Deadpool & Wolverine, fully loaded.
  const outing = await prisma.outing.findFirst({
    where: { circleId: circle.id, movieTmdbId: 533535 },
  });
  if (!outing) {
    const created = await prisma.outing.create({
      data: {
        circleId: circle.id,
        movieTmdbId: 533535,
        status: 'planned',
        ticketsOnSaleDate: '2024-07-01',
        rsvps: {
          create: [
            { userId: users.ajay.id, status: 'going' },
            { userId: users.sarah.id, status: 'going' },
            { userId: users.mike.id, status: 'maybe' },
            { userId: users.david.id, status: 'going' },
          ],
        },
        theaterVotes: {
          create: [
            { optionId: 't1', name: 'AMC IMAX Downtown', position: 0, voterIds: [users.ajay.id, users.sarah.id] },
            { optionId: 't2', name: 'Alamo Drafthouse', position: 1, voterIds: [users.mike.id, users.david.id] },
          ],
        },
        nightVotes: {
          create: [
            { optionId: 'n1', label: 'Friday Night', position: 0, voterIds: [users.ajay.id, users.sarah.id, users.mike.id] },
            { optionId: 'n2', label: 'Saturday Matinee', position: 1, voterIds: [users.david.id] },
          ],
        },
        hypes: {
          create: [
            { userId: users.ajay.id, score: 9 },
            { userId: users.sarah.id, score: 10 },
            { userId: users.mike.id, score: 8 },
            { userId: users.david.id, score: 9 },
          ],
        },
      },
    });
    // eslint-disable-next-line no-console
    console.log(`Seeded outing ${created.id} (Deadpool & Wolverine).`);
  }

  // Friendships among the five (all mutual friends).
  const handles = PEOPLE.map((p) => p.handle);
  for (let i = 0; i < handles.length; i++) {
    for (let j = 0; j < handles.length; j++) {
      if (i === j) continue;
      await prisma.friendship.upsert({
        where: {
          userId_otherId: { userId: users[handles[i]].id, otherId: users[handles[j]].id },
        },
        update: {},
        create: {
          userId: users[handles[i]].id,
          otherId: users[handles[j]].id,
          status: 'friends',
        },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded circle ${circle.id} "The Inner Five". Sign in with Google as yourself, then search these handles (ajay, sarah, …) to add them.`,
  );
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
