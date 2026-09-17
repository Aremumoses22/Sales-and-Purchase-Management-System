import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

export const API = '/api/v1';

export const ADMIN = {
  email: (process.env['SEED_ADMIN_EMAIL'] ?? 'admin@example.com').toLowerCase(),
  password: process.env['SEED_ADMIN_PASSWORD'] ?? 'Admin12345',
};

export type Agent = ReturnType<typeof request.agent>;

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error', 'warn'] });
  configureApp(app);
  // Listen once on a private port. Without this, supertest starts a throwaway listener for every
  // request, and a port freed by one request can be picked up by another process before the next.
  await app.listen(0, '127.0.0.1');
  return app;
}

/** Cookie-keeping client that sends the CSRF header on every request. */
export function client(app: NestExpressApplication): Agent {
  return request.agent(app.getHttpServer()).set('X-Requested-With', 'e2e');
}

export async function signIn(
  app: NestExpressApplication,
  credentials: { email: string; password: string } = ADMIN,
): Promise<Agent> {
  const agent = client(app);
  await agent.post(`${API}/auth/login`).send(credentials).expect(200);
  return agent;
}

/** Creates a throwaway user with the given role, clears the temporary password and signs in. */
export async function signInAsRole(app: NestExpressApplication, roleName: string): Promise<Agent> {
  const admin = await signIn(app);
  const roles = (await admin.get(`${API}/roles`).expect(200)).body as { id: string; name: string }[];
  const role = roles.find((candidate) => candidate.name === roleName);
  if (!role) throw new Error(`Role "${roleName}" does not exist`);

  const email = uniqueEmail(roleName.toLowerCase());
  const temporary = 'Temp12345';
  const password = 'Changed12345';
  await admin
    .post(`${API}/users`)
    .send({ name: `${roleName} tester`, email, roleId: role.id, password: temporary })
    .expect(201);

  const agent = await signIn(app, { email, password: temporary });
  await agent.post(`${API}/auth/change-password`).send({ currentPassword: temporary, newPassword: password }).expect(200);
  return agent;
}

export function cookiesFrom(response: Response): Record<string, string> {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  return Object.fromEntries(
    (header ?? []).map((cookie) => {
      const [pair = ''] = cookie.split(';');
      const index = pair.indexOf('=');
      return [pair.slice(0, index), decodeURIComponent(pair.slice(index + 1))];
    }),
  );
}

export const unique = (label: string) => `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const uniqueEmail = (prefix: string) =>
  `${prefix}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
