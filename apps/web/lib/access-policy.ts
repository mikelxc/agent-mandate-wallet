/** UI route policy. API handlers enforce their own authentication. */
export function isPublicPage(pathname: string, search: string = '') {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/') return !new URLSearchParams(search).has('operation');
  return path === '/payments' || path === '/store/developer-pack';
}
export function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/spending';
  try {
    const url = new URL(value, 'https://wayleave.invalid');
    if (url.origin !== 'https://wayleave.invalid' || url.searchParams.has('signin')) return '/spending';
    return url.pathname + url.search + url.hash;
  } catch { return '/spending'; }
}
