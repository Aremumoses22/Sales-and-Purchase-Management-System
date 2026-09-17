import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DEFAULT_ROLES, isPermission } from '@spms/shared';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { API, signInAsRole, type Agent } from './helpers.js';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../src/common/decorators.js';

interface Route {
  method: string;
  path: string;
  isPublic: boolean;
  permissions: string[];
}

function listRoutes(app: NestExpressApplication): Route[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const routes: Route[] = [];
  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
    const prototype = Object.getPrototypeOf(instance) as object;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = (prototype as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
      const routePath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (routePath === undefined) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      const targets = [handler, metatype];
      routes.push({
        method,
        path: `/${[base, routePath].filter((part) => part && part !== '/').join('/')}`.replace(/\/+/g, '/'),
        isPublic: Boolean(reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)),
        permissions: reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) ?? [],
      });
    }
  }
  return routes;
}

/**
 * Routes any signed-in user (or anyone) may call. Adding a route without a permission fails this
 * test until it is listed here on purpose.
 */
const OPEN_ROUTES = [
  'PUBLIC GET /health',
  'PUBLIC POST /auth/login',
  'PUBLIC POST /auth/refresh',
  'PUBLIC POST /auth/logout',
  'PUBLIC GET /settings/organization/logo',
  'ANY GET /auth/me',
  'ANY POST /auth/change-password',
  'ANY GET /search',
  // Forms everywhere need the organization, numbering preview and lookups to render.
  'ANY GET /settings/organization',
  'ANY GET /settings/number-series/:documentType',
  'ANY GET /settings/payment-terms',
  'ANY GET /settings/taxes',
  'ANY GET /settings/payment-modes',
  'ANY GET /settings/expense-categories',
];

const FAKE_ID = '0199b5a0-0000-7000-8000-00000000dead';

function concretePath(path: string): string {
  return `${API}${path.replace(':documentType', 'invoice').replace(/:[A-Za-z]+/g, FAKE_ID)}`;
}

function call(agent: Agent, route: Route) {
  const url = concretePath(route.path);
  switch (route.method) {
    case 'GET':
      return agent.get(url);
    case 'POST':
      return agent.post(url).send({});
    case 'PUT':
      return agent.put(url).send({});
    case 'PATCH':
      return agent.patch(url).send({});
    case 'DELETE':
      return agent.delete(url);
    default:
      throw new Error(`Unexpected method ${route.method}`);
  }
}

describe('Permissions (e2e)', () => {
  let app: NestExpressApplication;
  let routes: Route[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error', 'warn'] });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    routes = listRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('protects every route except the ones deliberately left open', () => {
    expect(routes.length).toBeGreaterThan(150);
    const open = routes
      .filter((route) => route.isPublic || route.permissions.length === 0)
      .map((route) => `${route.isPublic ? 'PUBLIC' : 'ANY'} ${route.method} ${route.path}`);
    expect(open.sort()).toEqual([...OPEN_ROUTES].sort());
  });

  it('sends baseline security headers', async () => {
    const response = await request(app.getHttpServer()).get(`${API}/health`).expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('only uses permissions that exist', () => {
    const unknown = routes.flatMap((route) => route.permissions.filter((permission) => !isPermission(permission)));
    expect(unknown).toEqual([]);
  });

  it.each(['Viewer', 'Sales'])('blocks a %s from every route their role does not allow', async (roleName) => {
    const role = DEFAULT_ROLES.find((candidate) => candidate.name === roleName);
    const granted = new Set<string>(role?.permissions ?? []);
    const agent = await signInAsRole(app, roleName);
    const problems: string[] = [];

    for (const route of routes) {
      if (route.isPublic || route.permissions.length === 0) continue;
      const allowed = route.permissions.every((permission) => granted.has(permission));
      // Allowed writes would really run, so only reads are exercised for allowed routes.
      if (allowed && route.method !== 'GET') continue;
      const response = await call(agent, route);
      if (!allowed && response.status !== 403) problems.push(`${route.method} ${route.path}: expected 403, got ${response.status}`);
      if (allowed && (response.status === 403 || response.status === 401 || response.status >= 500)) {
        problems.push(`${route.method} ${route.path}: allowed but got ${response.status}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
