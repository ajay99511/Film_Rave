import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Ratings-CSV imports post the file as a JSON string; lift the 100kb default.
  app.useBodyParser('json', { limit: '10mb' });

  // Trust the first proxy hop so req.ip is the real client (correct per-IP rate
  // limiting behind a platform load balancer: Render/Fly/Railway/etc.).
  app.set('trust proxy', 1);

  // `/health` stays outside the versioned prefix so platform probes hit a stable path.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true, credentials: true });

  const port = Number(config.get('PORT') ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`FilmRave API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
