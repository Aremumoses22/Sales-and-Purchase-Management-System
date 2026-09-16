import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  userId: string | null;
  ipAddress: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Starts a per-request context so services (e.g. the audit log) know who is acting. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ userId: null, ipAddress: req.ip ?? null }, () => next());
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export interface ClientMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export function clientMeta(req: Request): ClientMeta {
  return { ipAddress: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 300) ?? null };
}
