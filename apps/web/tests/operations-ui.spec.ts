import { expect, test } from '@playwright/test';
import { arcCctpRoute } from '@mandate/sdk';

for (const path of [
  '/spending',
  '/payments',
  '/?operation=9749ef3f-4f5c-4cf6-8fcf-5d4e622f3471',
]) {
  test(`shared spending workspace handles ${path}`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    if (path !== '/payments') {
      await expect(
        page.getByRole('heading', { name: 'Welcome back.', exact: true }),
      ).toBeVisible({ timeout: 30000 });
      expect(new URL(page.url()).searchParams.get('returnTo')).toBe(path);
      return;
    }
    await expect(
      page.getByRole('heading', {
        name: 'Your next customer has an AI agent.',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Requests & activity', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Open Spending →', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test('MCP operation links and checkout requests load automatically across sessions', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: 'mandate_session', value: 'a'.repeat(64), url: baseURL! },
  ]);
  const owner = '0x1111111111111111111111111111111111111111';
  const arcId = '9749ef3f-4f5c-4cf6-8fcf-5d4e622f3471';
  const arc = {
    id: arcId,
    agentId: 'test-agent',
    owner,
    createdAt: 20,
    status: 'approved',
    intent: {
      version: 1,
      kind: 'cctp_payment',
      sourceChainId: 5042002,
      destinationChainId: 11155111,
      sourceDomain: 26,
      destinationDomain: 0,
      amountSemantics: 'source_debit',
      minFinalityThreshold: 2000,
      sourceToken: arcCctpRoute.sourceToken,
      destinationToken: arcCctpRoute.destinationToken,
      maxFee: '0',
      idempotencyKey: 'arc-regression',
      fundingOwner: owner,
      account: owner,
      recipient: owner,
      amount: '2000000',
      businessReference: 'Arc regression purchase',
    },
  };
  let arcUnavailable = false;
  let signedIn = true;
  let revoked = false;
  await page.route('**/gateway/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/gateway/agents') return route.fulfill({ json: [] });
    if (path === '/gateway/identity/tokens')
      return route.fulfill({
        json: {
          connections: [
            {
              id: 'test-agent',
              name: 'Research agent',
              account: owner,
              expiresAt: 9999999999,
              revokedAt: revoked ? 1 : null,
            },
          ],
        },
      });
    if (path === '/gateway/identity/tokens/test-agent/revoke') {
      revoked = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/gateway/merchant/purchases')
      return route.fulfill({ json: { purchases: [] } });
    if (path === '/gateway/merchant/offerings')
      return route.fulfill({ json: { offerings: [] } });
    if (path === '/gateway/auth/session')
      return route.fulfill({ json: { address: owner, chainId: 11155111 } });
    if (path === '/gateway/crosschain/config')
      return route.fulfill({ json: { configured: true } });
    if (path === '/gateway/crosschain' && !signedIn)
      return route.fulfill({
        status: 401,
        json: { error: 'Sign in with your wallet' },
      });
    if (path === '/gateway/crosschain')
      return route.fulfill(
        arcUnavailable
          ? { status: 503, json: { error: 'Arc temporarily unavailable' } }
          : { json: { operations: [arc] } },
      );
    if (path === `/gateway/crosschain/${arcId}`)
      return route.fulfill({ json: arc });
    if (path === '/gateway/operations')
      return route.fulfill({
        json: [
          {
            id: 'sepolia-test',
            owner,
            createdAt: 10,
            status: 'approved',
            intent: {
              fundingOwner: owner,
              recipient: owner,
              amount: '1000000',
              businessReference: 'Sepolia regression purchase',
              expiresAt: 9999999999,
            },
          },
        ],
      });
    return route.fulfill({ json: {} });
  });
  await page.addInitScript(
    ({ owner }) => {
      const provider = {
        isMetaMask: true,
        on() {},
        removeListener() {},
        async request({ method }: { method: string }) {
          if (method === 'eth_accounts' || method === 'eth_requestAccounts')
            return [owner];
          if (method === 'eth_chainId') return '0xaa36a7';
          if (method === 'wallet_requestPermissions')
            return [{ parentCapability: 'eth_accounts' }];
          if (method === 'wallet_getCapabilities') return {};
          throw new Error(`Test wallet refuses ${method}`);
        },
      };
      Object.defineProperty(window, 'ethereum', { value: provider });
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              info: {
                uuid: '894c2487-1ae0-43f5-a532-7417d1ee09c2',
                name: 'Operations Test Wallet',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: 'test.wayleave.operations',
              },
              provider,
            },
          }),
        );
      window.addEventListener('eip6963:requestProvider', announce);
      announce();
    },
    { owner },
  );
  await page.goto('/spending');
  await expect(
    page.getByRole('link', { name: 'Arc regression purchase', exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole('link', {
      name: 'Sepolia regression purchase',
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('spending-hub-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath('spending-hub-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByRole('region', { name: 'Connected agents', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Research agent', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Developer Pack purchase tracker' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Create an Arc payment' }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Name & access' }),
  ).toHaveCount(0);
  await page.getByLabel('Agent', { exact: true }).selectOption('test-agent');
  await expect(
    page.getByRole('link', {
      name: 'Sepolia regression purchase',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByLabel('Group by', { exact: true }).selectOption('network');
  await expect(
    page.getByRole('region', { name: 'Arc → Sepolia', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('paid');
  await expect(
    page.getByText('No requests in this view', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Reset filters', exact: true })
    .click();
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(
    page.getByText(
      'Agent access revoked. Existing signed payments and token allowances are unchanged.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Expired & revoked agents (1)', { exact: true }),
  ).toBeVisible();
  arcUnavailable = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    page.getByText('Arc: Arc temporarily unavailable', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'Sepolia regression purchase',
      exact: true,
    }),
  ).toBeVisible();
  arcUnavailable = false;
  await page.goto(`/?operation=${arcId}`);
  await expect(
    page.getByText('Arc regression purchase', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText('Review the purchase your agent requested.', {
      exact: true,
    }),
  ).toBeVisible();
  // Checkout retries on owner sign-in without requiring a Load requests click.
  signedIn = false;
  await page.goto(`/payments?request=${arcId}`);
  await expect(page).toHaveURL(new RegExp('/spending\\?request=' + arcId));
  await expect(
    page.getByText('Sign in with your wallet', { exact: true }),
  ).toBeVisible();
  signedIn = true;
  await page.evaluate(
    (owner) =>
      window.dispatchEvent(
        new CustomEvent('wayleave:owner-session', {
          detail: { address: owner, chainId: 11155111 },
        }),
      ),
    owner,
  );
  await expect(
    page.getByText('Arc regression purchase', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Sign in with your wallet', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Load requests', exact: true }),
  ).toHaveCount(0);
  await page.goto('/');
  await expect(page).toHaveURL(/\/spending$/);

});
