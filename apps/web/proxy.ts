import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPage } from './lib/access-policy';

export function proxy(request: NextRequest) {
  // Retire the old page before authentication captures a return destination.
  if (request.nextUrl.pathname.replace(/\/$/, '') === '/agents/new') {
    const url = request.nextUrl.clone();
    url.pathname = '/connect';
    return NextResponse.redirect(url, 308);
  }
  if (isPublicPage(request.nextUrl.pathname, request.nextUrl.search)) return NextResponse.next();
  // Fast routing hint only. AccountAccessGate verifies this opaque session with
  // the gateway before mounting private UI; the gateway protects private data.
  const session = request.cookies.get('mandate_session')?.value;
  if (session && /^[a-f0-9]{64}$/.test(session)) return NextResponse.next();
  const url = request.nextUrl.clone();
  const destination = url.pathname + url.search;
  url.pathname = '/'; url.search = '';
  url.searchParams.set('signin', '1');
  url.searchParams.set('returnTo', destination);
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {
  matcher: ['/((?!gateway(?:/|$)|mcp(?:/|$)|store/developer-pack/agent(?:/|$)|_next/|.*\\.[^/]+$).*)'],
};
