import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  app.useLogger(app.get(Logger));

  // Helmet's default Cross-Origin-Resource-Policy is `same-origin`, which
  // browsers enforce independently of the CORS headers below — it would
  // silently block apps/web (a genuinely different origin, by design) from
  // reading this API's responses even with valid CORS + credentials. This
  // API exists specifically to be called cross-origin, so that default is
  // wrong here, not merely optional.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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
  app.get(Logger).log(`FilmRave API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
