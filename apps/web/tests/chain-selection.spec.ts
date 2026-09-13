import { expect, test } from '@playwright/test';

test.setTimeout(60_000);
test.beforeEach(async ({ page }) => {
  await page.route('**/gateway/**', (route) =>
    route.fulfill({ status: 401, json: { error: 'Sign in' } }),
  );
});

test('MCP approval link opens request review at the root URL', async ({
  page,
}) => {
  const query = '?operation=de11737d-4c90-4460-9118-57f80b4ae110&source=mcp';
  await page.goto(`/${query}`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(
    new RegExp(
      `/\\?operation=de11737d-4c90-4460-9118-57f80b4ae110&source=mcp$`,
    ),
  );
  await expect(page.locator('.agent-shell')).toHaveClass(/focused-payment/);
});

test('switching wallet networks keeps the current route and operation intact', async ({
  page,
}) => {
  await page.route('**/gateway/auth/session', (route) =>
    route.fulfill({
      json: {
        address: '0x1111111111111111111111111111111111111111',
        chainId: 11155111,
      },
    }),
  );
  await page.addInitScript(() => {
    let chain = '0xaa36a7';
    const listeners = new Map<string, Set<(value: unknown) => void>>();
    const provider = {
      on(event: string, listener: (value: unknown) => void) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(listener);
      },
      removeListener(event: string, listener: (value: unknown) => void) {
        listeners.get(event)?.delete(listener);
      },
      async request({
        method,
        params,
      }: {
        method: string;
        params: { chainId: string }[];
      }) {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts')
          return ['0x1111111111111111111111111111111111111111'];
        if (method === 'eth_chainId') return chain;
        if (method === 'wallet_getCapabilities') return {};
        if (method === 'wallet_requestPermissions')
          return [{ parentCapability: 'eth_accounts' }];
        if (method === 'wallet_switchEthereumChain') {
          chain = params[0].chainId;
          for (const listener of listeners.get('chainChanged') ?? [])
            listener(chain);
          return null;
        }
        throw new Error(`Unsupported ${method}`);
      },
    };
    const announce = () =>
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: {
            info: {
              uuid: 'fe984cc3-0124-4226-ae56-5a7de2f3bf92',
              name: 'Routing Test Wallet',
              icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
              rdns: 'test.routing',
            },
            provider,
          },
        }),
      );
    window.addEventListener('eip6963:requestProvider', announce);
    announce();
  });
  await page.goto('/identity', { waitUntil: 'domcontentloaded' });
  for (const path of [
    '/identity',
    '/accounts',
    '/payments',
    '/?operation=regression#review',
  ]) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const url = page.url();
    const selector = page.getByRole('combobox', { name: 'Wallet network' });
    for (const label of ['Arc testnet', 'Sepolia']) {
      await selector.click();
      await page.getByRole('option', { name: new RegExp(`^${label}`) }).click();
      await expect(selector).toContainText(label);
      await expect(page).toHaveURL(url);
    }
  }
});
