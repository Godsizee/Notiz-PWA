import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pbAuthCookie = request.cookies.get('pb_auth')?.value;
  
  let authStoreModel = null;
  let isValid = false;

  if (pbAuthCookie) {
    try {
      const parsedCookie = JSON.parse(decodeURIComponent(pbAuthCookie));
      authStoreModel = parsedCookie.model;
      isValid = !!parsedCookie.token; // check token presence
    } catch (e) {
      // Cookie parsing error, treat as invalid session
    }
  }

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === '/login' || pathname === '/change-password';

  // 1. Not Authenticated: redirect to login
  if (!isValid && !isAuthRoute && !pathname.startsWith('/api/') && !pathname.startsWith('/_next/') && pathname !== '/manifest.json') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isValid) {
    const needsPasswordChange = authStoreModel?.needs_password_change === true;

    // 2. Authenticated but has the initial password: force redirect to Change Password screen
    if (needsPasswordChange && pathname !== '/change-password' && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/change-password', request.url));
    }

    // 3. Authenticated & secure: redirect away from login/change-password back to home
    if (!needsPasswordChange && isAuthRoute) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (pwa manifest)
     * - sw.js, workbox-*.js (PWA service workers)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-).*)',
  ],
};
