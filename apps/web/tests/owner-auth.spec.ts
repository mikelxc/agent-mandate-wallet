import { expect, test } from '@playwright/test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { verifyMessage, type Address, type Hex } from 'viem';
import { Store } from '../../gateway/src/store';
import { createHostedGateway } from '../../gateway/src/hosted';
import type { Chain } from '../../gateway/src/chain';

for (const validSignature of [true, false])
  test(`Reown wallet flow ${validSignature ? 'verifies ownership' : 'rejects a wrong-wallet signature'}`, async ({
    page,
    baseURL,
  }) => {
    const owner = privateKeyToAccount(generatePrivateKey());
    const signer = validSignature
      ? owner
      : privateKeyToAccount(generatePrivateKey());
    const store = new Store(':memory:');
    const chain = {
      verifyLogin: (address, message, signature) =>
        verifyMessage({ address: address as Address, message, signature }),
    } as Chain;
    const gateway = createHostedGateway(store, chain, [
      new URL(baseURL!).origin,
    ]);
    let signatures = 0;
    let verified = false;
    let verificationStatus = 0;
    let cookie = '';
    await page.route('**/gateway/**', async (route) => {
      const request = route.request();
      const headers = new Headers(request.headers());
      if (cookie) headers.set('Cookie', cookie);
      const response = await gateway(
        new Request(request.url(), {
          method: request.method(),
          headers,
          body: request.postData(),
        }),
      );
      const nextCookie = response.headers.get('Set-Cookie');
      if (nextCookie) cookie = nextCookie.split(';')[0];
      if (request.url().endsWith('/auth/siwe/verify')) {
        verificationStatus = response.status;
        if (response.ok) verified = true;
      }
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    await page.exposeFunction('signOwnershipTestMessage', async (raw: Hex) => {
      signatures++;
      expect(verified).toBe(false);
      return signer.signMessage({ message: { raw } });
    });
    await page.addInitScript(
      ({ address }) => {
        let connected = false;
        const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
        const provider = {
          isMetaMask: true,
          on(event: string, fn: (...args: unknown[]) => void) {
            const set = listeners.get(event) ?? new Set();
            set.add(fn);
            listeners.set(event, set);
          },
          removeListener(event: string, fn: (...args: unknown[]) => void) {
            listeners.get(event)?.delete(fn);
          },
          async request({
            method,
            params,
          }: {
            method: string;
            params?: unknown[];
          }) {
            if (method === 'eth_accounts') return connected ? [address] : [];
            if (method === 'eth_requestAccounts') {
              connected = true;
              return [address];
            }
            if (method === 'eth_chainId') return '0xaa36a7';
            if (method === 'wallet_getCapabilities') return {};
            if (method === 'wallet_requestPermissions') {
              connected = true;
              return [{ parentCapability: 'eth_accounts' }];
            }
            if (method === 'personal_sign')
              return (window as any).signOwnershipTestMessage(params![0]);
            if (method === 'wallet_revokePermissions') {
              connected = false;
              return null;
            }
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
                  name: 'Ownership Test Wallet',
                  icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                  rdns: 'test.wayleave.wallet',
                },
                provider,
              },
            }),
          );
        window.addEventListener('eip6963:requestProvider', announce);
        announce();
      },
      { address: owner.address },
    );
    try {
      await page.goto('/');
      await page.getByRole('button', { name: 'Connect wallet' }).click();
      const modal = page.locator('w3m-modal');
      await modal.getByText('Ownership Test Wallet', { exact: true }).click();
      // Injected wallets use Reown's sign-in view; native WalletConnect authentication
      // can combine connection and signing in the wallet itself.
      await expect(
        modal.getByRole('button', { name: 'Sign', exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      expect(verified).toBe(false);
      await modal.getByRole('button', { name: 'Sign', exact: true }).click();
      await expect
        .poll(() => verificationStatus, { timeout: 20_000 })
        .toBe(validSignature ? 200 : 401);
      expect(signatures).toBe(1);
      if (validSignature) {
        await expect(page.locator('.mobile-status')).toContainText(
          'Owner verified.',
        );
      } else {
        expect(verified).toBe(false);
        expect(cookie).not.toContain('mandate_session=');
        await expect(page.locator('.mobile-status')).not.toContainText(
          'Owner verified.',
        );
      }
    } finally {
      await page.unrouteAll({ behavior: 'wait' });
      store.close();
    }
  });
