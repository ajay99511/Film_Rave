import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Options } from 'pino-http';

/**
 * Structured logging, shaped for GCP Cloud Logging once deployed to Cloud
 * Run. Cloud Run forwards stdout to Cloud Logging, which parses a JSON line
 * into a structured entry (filterable by field, correctly severity-colored)
 * only if it uses Cloud Logging's expected field names — otherwise every
 * line lands as an opaque `textPayload` blob. See docs/plans/
 * ops-production-floor.md Decision 1 for the full reasoning.
 *
 * In production: `message` (not pino's default `msg`) carries the log text,
 * `severity` (not `level`) carries a GCP severity string, and — when
 * `GOOGLE_CLOUD_PROJECT` is set (Cloud Run injects this automatically) and
 * the request carries Cloud Run's `X-Cloud-Trace-Context` header — every log
 * line for that request also carries `logging.googleapis.com/trace`, so
 * Cloud Logging's UI groups a request's log lines together.
 *
 * Outside production (local dev): plain pino defaults + pino-pretty, so logs
 * stay human-readable in a terminal. GOOGLE_CLOUD_PROJECT is never set
 * locally, so the trace field never fires there regardless — the
 * production-only formatter split exists only because pino-pretty expects
 * the standard `level`/`msg` shape to render colors, not because the trace
 * logic itself is production-only.
 */

const GCP_SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

function traceId(req: { headers: Record<string, unknown> }): string | undefined {
  const header = req.headers['x-cloud-trace-context'];
  const raw: unknown = Array.isArray(header) ? header[0] : header;
  return typeof raw === 'string' ? raw.split('/')[0] : undefined;
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): { pinoHttp: Options } => {
        const isProd = config.get('NODE_ENV') === 'production';
        const gcpProjectId = config.get<string>('GOOGLE_CLOUD_PROJECT');

        const pinoHttp: Options = {
          genReqId: (req) => traceId(req) ?? randomUUID(),
          customAttributeKeys: { reqId: 'requestId' },
          customProps: (req) => {
            const trace = traceId(req);
            return gcpProjectId && trace
              ? { 'logging.googleapis.com/trace': `projects/${gcpProjectId}/traces/${trace}` }
              : {};
          },
          ...(isProd
            ? {
                messageKey: 'message',
                formatters: {
                  level: (label: string) => ({
                    severity: GCP_SEVERITY[label] ?? label.toUpperCase(),
                  }),
                },
              }
            : {
                transport: { target: 'pino-pretty', options: { singleLine: true } },
              }),
        };

        return { pinoHttp };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
