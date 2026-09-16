import type { CookieOptions, Response } from 'express';
import { config } from '../../config.js';

export const ACCESS_COOKIE = 'spms_at';
/** The web app's proxy checks for this cookie to decide whether to show the login page. */
export const REFRESH_COOKIE = 'spms_rt';

function baseOptions(): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    maxAge: config.accessTokenTtlMinutes * 60_000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    maxAge: config.refreshTokenTtlDays * 86_400_000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseOptions());
  res.clearCookie(REFRESH_COOKIE, baseOptions());
}
