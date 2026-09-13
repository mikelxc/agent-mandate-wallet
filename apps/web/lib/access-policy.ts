/** UI route policy. API handlers enforce their own authentication. */
export function isPublicPage(pathname: string, search: string = '') {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/') return !new URLSearchParams(search).has('operation');
  return path === '/payments' || path === '/store/developer-pack';
}
export function safeReturnTo(value: string | null) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return '/spending';
  try {
    const url = new URL(value, 'https://wayleave.invalid');
    if (
      url.origin !== 'https://wayleave.invalid' ||
      url.searchParams.has('signin')
    )
      return '/spending';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/spending';
  }
}

/** Actual page routes; unknown URLs must reach Next's 404 without a sign-in redirect.
 * Add new application pages here alongside their public/private policy. */
export function isAppPage(pathname: string) {
  const path = pathname.replace(/\/$/, '') || '/';
  return [
    '/',
    '/payments',
    '/store/developer-pack',
    '/accounts',
    '/accounts/new',
    '/connect',
    '/agents/new',
    '/spending',
    '/identity',
    '/advanced',
  ].includes(path);
}
