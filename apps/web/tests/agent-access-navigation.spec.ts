import { expect, test } from '@playwright/test';
test('retired agent page redirects before sign-in and preserves wallet selection', async ({ request, page }) => {
  const destination = '/connect?chainId=11155111&account=0x123';
  const response = await request.get('/agents/new?chainId=11155111&account=0x123', { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  const target = new URL(response.headers().location, response.url());
  expect(target.pathname + target.search).toBe(destination);
  await page.goto('/agents/new?chainId=11155111&account=0x123');
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe(destination);
  await expect(page.getByRole('heading', { name: 'Sign in to your account', exact: true })).toBeVisible();
});
