import { test, expect } from 'bun:test';
import { isAppPage, isPublicPage, safeReturnTo } from './access-policy';
test('public browsing is explicit and payment approvals on root are gated', () => {
  for (const path of ['/', '/payments', '/payments/', '/store/developer-pack'])
    expect(isPublicPage(path)).toBe(true);
  expect(isPublicPage('/', 'setup=5')).toBe(true);
  expect(isPublicPage('/', 'operation=private')).toBe(false);
  for (const path of [
    '/accounts',
    '/accounts/new',
    '/connect',
    '/agents/new',
    '/spending',
    '/identity',
    '/advanced',
    '/payments/private',
  ])
    expect(isPublicPage(path)).toBe(false);
});
test('return destinations remain inside the app without sign-in loops', () => {
  expect(safeReturnTo('/connect?chainId=5042002&account=0x123#access')).toBe(
    '/connect?chainId=5042002&account=0x123#access',
  );
  for (const value of [
    null,
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/?signin=1',
  ])
    expect(safeReturnTo(value)).toBe('/spending');
});

test('every application page is registered before unknown routes bypass the access gate', async () => {
  const appDirectory = new URL('../app/', import.meta.url).pathname;
  for await (const file of new Bun.Glob('**/page.tsx').scan(appDirectory)) {
    const route = '/' + file.replace(/(^|\/)page\.tsx$/, '');
    expect(isAppPage(route)).toBe(true);
  }
  for (const path of ['/missing', '/accounts/missing', '/missing.html'])
    expect(isAppPage(path)).toBe(false);
});
