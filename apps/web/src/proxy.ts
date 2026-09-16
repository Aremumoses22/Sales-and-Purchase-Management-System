import { NextResponse, type NextRequest } from 'next/server';

/** Set while a session exists; the API is still the authority on every request. */
const SESSION_COOKIE = 'spms_rt';
const LOGIN_PATH = '/login';

export function proxy(request: NextRequest) {
  const signedIn = request.cookies.has(SESSION_COOKIE);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && pathname !== LOGIN_PATH) {
    const login = new URL(LOGIN_PATH, request.url);
    if (pathname !== '/') login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (signedIn && pathname === LOGIN_PATH) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything except API calls, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)'],
};
