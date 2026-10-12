import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// PocketBase auth tokens are JWTs. Treat one as valid only if its exp lies in the
// future — mirroring the client's pb.authStore.isValid. Without the expiry check an
// expired-but-present token is accepted here yet rejected on the client, producing a
// /login ⇄ / redirect loop (endless "Sitzung wird geladen" spinner).
function tokenNotExpired(token: string): boolean {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    const payload = JSON.parse(atob(b64 + pad));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// Heisst 'proxy' statt 'middleware': Next 16 hat die middleware-Konvention
// deprecated und erwartet Datei und Export unter diesem Namen. Verhalten und
// Signatur sind unveraendert.
export function proxy(request: NextRequest) {
  const pbAuthCookie = request.cookies.get('pb_auth')?.value;

  let authStoreModel = null;
  let isValid = false;

  if (pbAuthCookie) {
    try {
      const parsedCookie = JSON.parse(decodeURIComponent(pbAuthCookie));
      authStoreModel = parsedCookie.model;
      isValid = !!parsedCookie.token && tokenNotExpired(parsedCookie.token);
    } catch {
      // Cookie parsing error, treat as invalid session
    }
  }

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === '/login' || pathname === '/change-password';
  // "/" und "/~offline" sind vorgerenderte Huellen ohne Nutzerdaten (die Notizen
  // laedt der Client nach der Anmeldung; ohne Sitzung leitet HomeScreen selbst auf
  // /login). Der Service Worker precacht beide beim Installieren — meist beim
  // ersten Besuch, also ausgeloggt. Haette der Proxy sie dann auf /login
  // umgeleitet, laege die Login-Seite im Precache und wuerde offline statt der App
  // gezeigt (Plan UI-Overhaul B.6 #2, am echten Service Worker nachgemessen).
  const isPublicShell = pathname === '/' || pathname === '/~offline';

  // 1. Not Authenticated: redirect to login
  if (!isValid && !isAuthRoute && !isPublicShell && !pathname.startsWith('/api/') && !pathname.startsWith('/_next/') && pathname !== '/manifest.json') {
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
     * Match all request paths except:
     * - api/    (route handlers do their own auth against PocketBase)
     * - _next/  (build output: static chunks, image optimizer)
     * - anything with a static file extension
     *
     * Der Datei-Endungs-Ausschluss ist nicht kosmetisch: ohne ihn lief JEDE
     * Anfrage aus /public durch die Weiterleitung oben. Ausgeloggt kam damit
     * fuer /logo.png ein 307 auf /login zurueck — das Logo auf der Login-Seite
     * selbst blieb kaputt, und die im Manifest referenzierten Install-Icons
     * (/icon-192x192.png, /icon-512x512.png) waren vor dem Login nicht
     * ladbar. Das sind oeffentliche Markenassets ohne Nutzerdaten; welche
     * SEITEN Auth brauchen, aendert sich dadurch nicht.
     */
    '/((?!api/|_next/|.*\.(?:ico|png|jpg|jpeg|gif|svg|webp|avif|json|js|txt|xml|woff2?)$).*)',
  ],
};
