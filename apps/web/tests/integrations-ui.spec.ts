import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });
test('Arc is the payment default and mainnet is visibly unavailable', async ({ page }) => {
  await page.goto('/identity');
  const network = page.getByLabel('Wallet network', { exact: true });
  await expect(network).toContainText('Arc testnet');
  await network.click();
  await expect(page.getByRole('option', { name: /Mainnet/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('option', { name: /Sepolia/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(network).toContainText('Arc testnet');
});
test('portable identity starts with a name and keeps discovery separate from authentication', async ({
  page,
}) => {
  await page.route('**/gateway/identity/discover?**', (route) =>
    route.fulfill({
      json: { error: 'Name not found on the selected deployment' },
      status: 400,
    }),
  );
  await page.goto('/identity');
  await expect(
    page.getByRole('heading', { name: /A familiar name/ }),
  ).toBeVisible();
  await page.getByLabel('ENS name').fill('missing.eth');
  await page.getByRole('button', { name: 'Look up name' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Name not found' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Verify and link wallet' }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('unconfigured Arc does not present payment execution as available', async ({
  page,
}) => {
  await page.route('**/gateway/crosschain/config', (route) =>
    route.fulfill({
      json: {
        configured: false,
        chainId: 5042002,
        destinationChainId: 11155111,
      },
    }),
  );
  await page.goto('/payments');
  await expect(
    page.getByRole('heading', { name: 'Payments', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Payments aren’t ready here yet' })).toContainText('not configured');
  await expect(page.getByLabel('Agent wallet on Arc')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('Arc spending begins with ownership and requests, not a transfer form', async ({
  page,
}) => {
  await page.route('**/gateway/crosschain/config', (route) =>
    route.fulfill({
      json: {
        configured: true,
        chainId: 5042002,
        destinationChainId: 11155111,
      },
    }),
  );
  await page.goto('/payments');
  await expect(
    page.getByRole('button', { name: 'Connect wallet', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Agent wallet on Arc')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Cross-chain payments', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Payments', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByText('Circle CCTP transfers native test USDC', { exact: false }),
  ).not.toBeVisible();
  await page.getByText('About this test route', { exact: true }).click();
  await expect(
    page.getByText('Circle CCTP transfers native test USDC', { exact: false }),
  ).toBeVisible();
});

test('a discovered name does not expose wallet or connection management', async ({
  page,
}) => {
  await page.route('**/gateway/identity/discover?**', (route) =>
    route.fulfill({
      json: {
        name: 'research.wayleave.eth',
        controller: '0x1111111111111111111111111111111111111111',
        expiresAt: 1800000000,
        subregistry: '0x2222222222222222222222222222222222222222',
        canSetSubregistry: true,
      },
    }),
  );
  await page.goto('/identity');
  await page.getByLabel('ENS name').fill('research.wayleave.eth');
  await page.getByRole('button', { name: 'Look up name' }).click();
  await expect(
    page.getByRole('heading', { name: 'research.wayleave.eth', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('summary').filter({ hasText: 'Connect an agent wallet' }),
  ).toHaveCount(0);
  await expect(
    page.locator('summary').filter({ hasText: 'Manage named connections' }),
  ).toHaveCount(0);
  await page.getByText('Name details', { exact: true }).click();
  await expect(
    page.getByText('0x1111111111111111111111111111111111111111', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('payment review separates setup, pending source and completed receipts', async ({
  page,
}) => {
  const owner = '0x1111111111111111111111111111111111111111';
  const hash = `0x${'ab'.repeat(32)}`;
  const intent = {
    version: 1,
    kind: 'cctp_payment',
    sourceChainId: 5042002,
    destinationChainId: 11155111,
    sourceDomain: 26,
    destinationDomain: 0,
    sourceToken: '0x3600000000000000000000000000000000000000',
    destinationToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    account: '0x2222222222222222222222222222222222222222',
    fundingOwner: owner,
    recipient: '0x3333333333333333333333333333333333333333',
    amount: '2000000',
    maxFee: '0',
    amountSemantics: 'source_debit',
    minFinalityThreshold: 2000,
    businessReference: 'Research report',
    idempotencyKey: 'ui-review',
  };
  await page.route('**/gateway/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/session'))
      return route.fulfill({ json: { address: owner, chainId: 11155111 } });
    if (path.endsWith('/crosschain/config'))
      return route.fulfill({ json: { configured: true } });
    if (path.endsWith('/crosschain') && route.request().method() === 'GET')
      return route.fulfill({
        json: {
          operations: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              intent,
              status: 'proposed',
            },
            {
              id: 'pending',
              intent: { ...intent, businessReference: 'Pending report' },
              status: 'source_submitted',
              signature: '0x01',
              sourceTransactionHash: hash,
            },
            {
              id: 'complete',
              intent: { ...intent, businessReference: 'Delivered funds' },
              status: 'completed',
              source: { transactionHash: hash },
              destination: { transactionHash: hash, merchantAmount: '2000000' },
            },
          ],
        },
      });
    return route.fulfill({
      status: 400,
      json: { error: 'This UI fixture permits reads only' },
    });
  });
  await page.addInitScript(
    ({ owner }) => {
      const provider = {
        on() {},
        removeListener() {},
        async request({ method }: { method: string }) {
          if (method === 'eth_accounts' || method === 'eth_requestAccounts')
            return [owner];
          if (method === 'eth_chainId') return '0xaa36a7';
          if (method === 'wallet_getCapabilities') return {};
          if (method === 'wallet_requestPermissions')
            return [{ parentCapability: 'eth_accounts' }];
          throw new Error(`Read-only test wallet refuses ${method}`);
        },
      };
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              info: {
                uuid: '894c2487-1ae0-43f5-a532-7417d1ee09c2',
                name: 'Review Test Wallet',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: 'test.wayleave.review',
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
  await page.goto('/payments?request=11111111-1111-4111-8111-111111111111');
  await page
    .getByRole('button', { name: 'Load requests', exact: true })
    .click();
  const review = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Research report', exact: true }),
  });
  await expect(
    review.getByRole('button', { name: 'Check payment readiness' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Pending report', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all payments' }).click();
  await review.locator('.payment-review > summary').click();
  await expect(
    review.getByRole('button', { name: 'Check payment readiness' }),
  ).toBeVisible();
  await expect(
    review.getByRole('button', { name: 'Allow this payment amount' }),
  ).not.toBeVisible();
  await review
    .locator('summary')
    .filter({ hasText: 'Prepare your wallet' })
    .click();
  await expect(
    review.getByRole('button', { name: 'Allow this payment amount' }),
  ).toBeVisible();
  const pending = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Pending report', exact: true }),
  });
  await pending.locator('.payment-review > summary').click();
  await expect(pending).toContainText('Checking Arc transaction');
  await expect(
    pending.getByRole('button', { name: 'Check source receipt' }),
  ).toBeVisible();
  await expect(
    pending.getByRole('button', { name: 'Send approved payment' }),
  ).toHaveCount(0);
  const completed = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Delivered funds', exact: true }),
  });
  await expect(completed).toContainText('Recipient received 2 USDC');
  await expect(completed.getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create request' }).click();
  await expect(page.getByLabel('Agent wallet on Arc')).toBeVisible();
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .map((el) => ({
        tag: el.tagName,
        cls: el.className,
        width: el.getBoundingClientRect().width,
      }))
      .slice(0, 12),
  );
  expect(overflow).toEqual([]);
  await page.screenshot({
    path: '/tmp/wayleave-payment-review-mobile.png',
    fullPage: true,
  });
});

test('Arc recovers from a non-JSON gateway outage', async ({ page }) => {
  let available = false;
  await page.route('**/gateway/crosschain/config', (route) =>
    available
      ? route.fulfill({
          json: {
            configured: true,
            chainId: 5042002,
            destinationChainId: 11155111,
          },
        })
      : route.fulfill({
          status: 500,
          contentType: 'text/plain',
          body: 'Internal Server Error',
        }),
  );
  await page.goto('/payments');
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Wayleave could not reach the gateway' }),
  ).toBeVisible();
  await expect(
    page.getByText('Unexpected token', { exact: false }),
  ).toHaveCount(0);
  available = true;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Connect wallet', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Try again', exact: true }),
  ).toHaveCount(0);
});
