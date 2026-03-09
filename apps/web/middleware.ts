/**
 * Next.js Server Middleware - Route Protection
 *
 * Enforces authentication server-side before pages render.
 * Checks for guardian_token in localStorage is client-only;
 * this middleware catches unauthenticated server-rendered requests.
 *
 * Strategy: Check for guardian_token cookie. If missing, redirect to /login.
 * The token is stored in localStorage by useAuth, but we also set a
 * lightweight cookie flag so the middleware can detect auth state.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Routes that don't require authentication */
const PUBLIC_PATHS = ['/login', '/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for auth cookie (set by frontend on login)
  const hasAuth = request.cookies.get('guardian_auth');
  if (!hasAuth) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
