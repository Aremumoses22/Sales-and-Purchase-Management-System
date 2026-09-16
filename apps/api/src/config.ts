import 'dotenv/config';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const config = {
  port: Number(process.env['PORT'] ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  accessTokenTtlMinutes: Number(process.env['ACCESS_TOKEN_TTL_MINUTES'] ?? 15),
  refreshTokenTtlDays: Number(process.env['REFRESH_TOKEN_TTL_DAYS'] ?? 7),
  cookieSecure: process.env['COOKIE_SECURE'] === 'true',
  uploadDir: path.resolve(process.env['UPLOAD_DIR'] ?? 'uploads'),
  /** Runs the recurring invoice job on a schedule; tests switch it off and call the job directly. */
  recurringJobEnabled: process.env['RECURRING_JOB_ENABLED'] !== 'false',
} as const;
