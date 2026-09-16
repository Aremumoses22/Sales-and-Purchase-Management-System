import type { NestExpressApplication } from '@nestjs/platform-express';
import type { RoleDto } from '@spms/shared';
import request from 'supertest';
import { ADMIN, API, client, cookiesFrom, createTestApp, signIn, uniqueEmail } from './helpers.js';

describe('Auth, users and roles (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const raw = () => request(app.getHttpServer());

  it('rejects a wrong password with the standard error body', async () => {
    const res = await client(app).post(`${API}/auth/login`).send({ email: ADMIN.email, password: 'wrong-pass-1' }).expect(401);
    expect(res.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' } });
  });

  it('reports validation errors per field', async () => {
    const res = await client(app).post(`${API}/auth/login`).send({ email: 'not-an-email', password: '' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((issue: { path: string }) => issue.path)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('requires the X-Requested-With header on state-changing requests', async () => {
    const res = await raw().post(`${API}/auth/login`).send(ADMIN).expect(403);
    expect(res.body.error.code).toBe('CSRF_HEADER_MISSING');
  });

  it('signs in with httpOnly cookies and returns the user with permissions', async () => {
    const res = await client(app).post(`${API}/auth/login`).send(ADMIN).expect(200);
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.find((cookie) => cookie.startsWith('spms_at='))).toMatch(/HttpOnly/);
    expect(setCookie.find((cookie) => cookie.startsWith('spms_rt='))).toMatch(/SameSite=Lax/);
    expect(res.body.user.email).toBe(ADMIN.email);
    expect(res.body.user.permissions).toContain('users:manage');
    expect(res.body.organization.currencyCode).toBeTruthy();
  });

  it('rejects requests without a session', async () => {
    const res = await raw().get(`${API}/auth/me`).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rotates refresh tokens and refuses one that was already used', async () => {
    const original = cookiesFrom(await client(app).post(`${API}/auth/login`).send(ADMIN).expect(200));

    const refreshed = await raw()
      .post(`${API}/auth/refresh`)
      .set('X-Requested-With', 'e2e')
      .set('Cookie', `spms_rt=${original['spms_rt']}`)
      .expect(200);
    const rotated = cookiesFrom(refreshed);
    expect(rotated['spms_rt']).toBeTruthy();
    expect(rotated['spms_rt']).not.toBe(original['spms_rt']);

    await raw()
      .post(`${API}/auth/refresh`)
      .set('X-Requested-With', 'e2e')
      .set('Cookie', `spms_rt=${original['spms_rt']}`)
      .expect(401);
    await raw().get(`${API}/auth/me`).set('Cookie', `spms_at=${rotated['spms_at']}`).expect(200);
  });

  it('signs out and revokes the refresh token', async () => {
    const session = cookiesFrom(await client(app).post(`${API}/auth/login`).send(ADMIN).expect(200));
    const cookie = `spms_rt=${session['spms_rt']}`;
    await raw().post(`${API}/auth/logout`).set('X-Requested-With', 'e2e').set('Cookie', cookie).expect(204);
    await raw().post(`${API}/auth/refresh`).set('X-Requested-With', 'e2e').set('Cookie', cookie).expect(401);
  });

  it('temporarily blocks sign-in after repeated failures', async () => {
    const email = uniqueEmail('locked');
    for (let attempt = 0; attempt < 5; attempt++) {
      await client(app).post(`${API}/auth/login`).send({ email, password: 'wrong-pass-1' }).expect(401);
    }
    const res = await client(app).post(`${API}/auth/login`).send({ email, password: 'wrong-pass-1' }).expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('makes new users change their temporary password, then enforces their role', async () => {
    const admin = await signIn(app);
    const roles = (await admin.get(`${API}/roles`).expect(200)).body as RoleDto[];
    const viewer = roles.find((role) => role.name === 'Viewer');
    const email = uniqueEmail('viewer');
    const created = await admin
      .post(`${API}/users`)
      .send({ name: 'Vera Viewer', email, roleId: viewer?.id, password: 'Temp12345' })
      .expect(201);
    expect(created.body).toMatchObject({ email, mustChangePassword: true, role: { name: 'Viewer' } });

    const user = await signIn(app, { email, password: 'Temp12345' });
    expect((await user.get(`${API}/auth/me`).expect(200)).body.user.mustChangePassword).toBe(true);
    expect((await user.get(`${API}/settings/taxes`).expect(403)).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const wrong = await user
      .post(`${API}/auth/change-password`)
      .send({ currentPassword: 'nope12345', newPassword: 'Better12345' })
      .expect(400);
    expect(wrong.body.error.details).toEqual([{ path: 'currentPassword', message: 'Current password is incorrect' }]);

    await user.post(`${API}/auth/change-password`).send({ currentPassword: 'Temp12345', newPassword: 'Better12345' }).expect(200);
    await user.get(`${API}/settings/taxes`).expect(200);
    expect((await user.post(`${API}/settings/taxes`).send({ name: 'Nope', rate: '5' }).expect(403)).body.error.code).toBe(
      'FORBIDDEN',
    );
    await user.get(`${API}/users`).expect(403);
  });

  it('refuses duplicate user emails', async () => {
    const admin = await signIn(app);
    const roles = (await admin.get(`${API}/roles`)).body as RoleDto[];
    const res = await admin
      .post(`${API}/users`)
      .send({ name: 'Copy', email: ADMIN.email.toUpperCase(), roleId: roles[0]?.id, password: 'Temp12345' })
      .expect(400);
    expect(res.body.error.details).toEqual([{ path: 'email', message: 'A user with this email already exists' }]);
  });

  it('protects the acting user and the last active admin', async () => {
    const admin = await signIn(app);
    const me = (await admin.get(`${API}/auth/me`)).body.user;
    const roles = (await admin.get(`${API}/roles`)).body as RoleDto[];
    const sales = roles.find((role) => role.name === 'Sales');

    const deactivate = await admin.put(`${API}/users/${me.id}`).send({ name: me.name, roleId: me.role.id, isActive: false }).expect(409);
    expect(deactivate.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');

    const demote = await admin.put(`${API}/users/${me.id}`).send({ name: me.name, roleId: sales?.id, isActive: true }).expect(409);
    expect(demote.body.error.code).toBe('LAST_ADMIN');
  });

  it('keeps the Admin role locked and lets admins manage custom roles', async () => {
    const admin = await signIn(app);
    const roles = (await admin.get(`${API}/roles`)).body as RoleDto[];
    const adminRole = roles.find((role) => role.isSystem);

    const locked = await admin.put(`${API}/roles/${adminRole?.id}`).send({ name: 'Admin', permissions: [] }).expect(409);
    expect(locked.body.error.code).toBe('SYSTEM_ROLE');

    const invalid = await admin.post(`${API}/roles`).send({ name: 'Bad', permissions: ['quotes:fly'] }).expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const created = await admin
      .post(`${API}/roles`)
      .send({ name: 'Storekeeper', permissions: ['items:view', 'items:adjust_stock', 'items:view'] })
      .expect(201);
    expect(created.body.permissions).toEqual(['items:view', 'items:adjust_stock']);
    await admin.delete(`${API}/roles/${created.body.id}`).expect(204);
  });
});
