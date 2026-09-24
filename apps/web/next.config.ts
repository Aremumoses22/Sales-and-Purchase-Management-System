import type { NextConfig } from 'next';

// API_URL wins; otherwise build it from API_HOST, which Render fills with the API's private hostname (render.yaml).
const apiUrl =
  process.env.API_URL ??
  (process.env.API_HOST
    ? `http://${process.env.API_HOST}:${process.env.API_PORT ?? '4000'}`
    : 'http://localhost:4000');

const nextConfig: NextConfig = {
  // The browser only ever talks to this origin; Next forwards /api/* to the NestJS API,
  // so session cookies stay first-party and no CORS setup is needed.
  rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
