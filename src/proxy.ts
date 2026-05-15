import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const pbAuthCookie = request.cookies.get('pb_auth')?.value;
  
  let authStoreModel = null;
  let isValid = false;

  if (pbAuthCookie) {
    try {
      const parsedCookie = JSON.parse(decodeURIComponent(pbAuthCookie));
      authStoreModel = parsedCookie.model;
      isValid = !!parsedCookie.token; // simple check, proper check requires server ping but fine for middleware
    } catch (e) {
      // Cookie parsing error
    }
  }

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === '/login' || pathname === '/change-password';

  if (!isValid && !isAuthRoute && !pathname.startsWith('/api/') && !pathname.startsWith('/_next/') && pathname !== '/manifest.json') {
    // Not authenticated, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isValid) {
    const needsPasswordChange = authStoreModel?.needs_password_change === true;

    if (needsPasswordChange && pathname !== '/change-password' && !pathname.startsWith('/api/')) {
      // Authenticated but needs password change
      return NextResponse.redirect(new URL('/change-password', request.url));
    }

    if (!needsPasswordChange && isAuthRoute) {
      // Authenticated and fine, redirect away from auth pages
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (pwa manifest)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json).*)',
  ],
};
