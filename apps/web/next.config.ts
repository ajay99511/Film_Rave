import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Self-contained server build (node_modules pruned to only what's actually
  // used) — what the Cloud Run Dockerfile's final stage runs.
  output: 'standalone',
  // Pin file tracing to the monorepo root (avoids picking up a stray lockfile).
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // Compile the shared workspace package from source.
  transpilePackages: ['@filmrave/shared'],
  env: {
    NEXT_PUBLIC_API_BASE:
      process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000/api/v1',
  },
};

export default nextConfig;
