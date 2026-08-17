import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { CirclesModule } from './circles/circles.module.js';
import { RatingsModule } from './ratings/ratings.module.js';
import { MoviesModule } from './movies/movies.module.js';
import { ChatModule } from './chat/chat.module.js';
import { OutingsModule } from './outings/outings.module.js';
import { FriendshipsModule } from './friendships/friendships.module.js';
import { WatchlistModule } from './watchlist/watchlist.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ImportsModule } from './imports/imports.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Baseline abuse guard: 100 requests / minute / IP. Auth routes tighten this
    // further with @Throttle; /health opts out with @SkipThrottle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    CirclesModule,
    RatingsModule,
    MoviesModule,
    ChatModule,
    OutingsModule,
    FriendshipsModule,
    WatchlistModule,
    NotificationsModule,
    ImportsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
