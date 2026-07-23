import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
