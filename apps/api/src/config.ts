import 'dotenv/config';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const production = process.env['NODE_ENV'] === 'production';

export const config = {
  production,
  port: Number(process.env['PORT'] ?? 4000),
  /** Behind the web app in production, listen on 127.0.0.1 so the API is not reachable directly. */
  host: process.env['HOST'] ?? '0.0.0.0',
  /** Interactive API docs at /api/docs; off in production unless asked for. */
  apiDocsEnabled: (process.env['API_DOCS_ENABLED'] ?? (production ? 'false' : 'true')) === 'true',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  accessTokenTtlMinutes: Number(process.env['ACCESS_TOKEN_TTL_MINUTES'] ?? 15),
  refreshTokenTtlDays: Number(process.env['REFRESH_TOKEN_TTL_DAYS'] ?? 7),
  cookieSecure: process.env['COOKIE_SECURE'] === 'true',
  uploadDir: path.resolve(process.env['UPLOAD_DIR'] ?? 'uploads'),
  /** Runs the recurring invoice job on a schedule; tests switch it off and call the job directly. */
  recurringJobEnabled: process.env['RECURRING_JOB_ENABLED'] !== 'false',
} as const;

/** Refuses to start a production server with settings that would make it unsafe. */
export function assertProductionConfig(): void {
  if (!config.production) return;
  const problems: string[] = [];
  if (config.jwtSecret.length < 32 || config.jwtSecret === 'change-me') {
    problems.push('JWT_SECRET must be a random value of at least 32 characters (openssl rand -hex 48)');
  }
  if (!config.cookieSecure) problems.push('COOKIE_SECURE must be true so session cookies are only sent over HTTPS');
  if (problems.length > 0) throw new Error(`Unsafe production configuration:\n- ${problems.join('\n- ')}`);
}
