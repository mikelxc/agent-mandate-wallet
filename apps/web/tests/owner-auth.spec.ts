import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { decodeFunctionData, encodeFunctionResult, multicall3Abi, verifyMessage, type Address, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { sepoliaDeployment } from '@mandate/sdk';
import { Store } from '../../gateway/src/store';
import { createHostedGateway } from '../../gateway/src/hosted';
import type { Chain } from '../../gateway/src/chain';

test.setTimeout(60_000);

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
    const chain: Chain = {
      ownership: async () => ({ owner: owner.address.toLowerCase(), tokenId: '1', epoch: '0' }),
      verifyLogin: (address, message, signature) =>
        verifyMessage({ address: address as Address, message, signature }),
      balances: async () => { throw new Error('Not used by connection tests'); },
      prepare: async () => { throw new Error('Not used by connection tests'); },
      verifyApproval: async () => { throw new Error('Not used by connection tests'); },
      receipt: async () => { throw new Error('Not used by connection tests'); },
    };
    const gateway = createHostedGateway(store, chain, [
      new URL(baseURL!).origin,
    ]);
    await store.createAgent({ owner: owner.address.toLowerCase(), name: 'Existing agent', account: '0x1111111111111111111111111111111111111111', tokenHash: 'test-existing-token-hash', expiresAt: Math.floor(Date.now() / 1000) + 86400 }, Math.floor(Date.now() / 1000));
    let nfatBalance = 0;
    let balanceReads = 0;
    await page.route((url) => url.hostname === new URL(sepolia.rpcUrls.default.http[0]).hostname || url.hostname === 'rpc.walletconnect.org', async (route) => {
      const body = route.request().postDataJSON();
      const contractReply = (target: string, data: Hex): { success: boolean; returnData: Hex } => {
        if (data.startsWith('0x70a08231') && target.toLowerCase() === sepoliaDeployment.registry.toLowerCase()) {
          expect(data.slice(-40).toLowerCase()).toBe(owner.address.slice(2).toLowerCase());
          balanceReads++;
          return { success: true, returnData: `0x${nfatBalance.toString(16).padStart(64, '0')}` };
        }
        return { success: false, returnData: '0x' };
      };
      const reply = (call: any) => {
        if (call.method === 'eth_call') {
          const { to, data } = call.params[0];
          if (data.startsWith('0x82ad56cb')) {
            const decoded = decodeFunctionData({ abi: multicall3Abi, data });
            if (decoded.functionName === 'aggregate3') {
              const result = decoded.args[0].map((entry) => contractReply(entry.target, entry.callData));
              return { jsonrpc: '2.0', id: call.id, result: encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result }) };
            }
          }
          const result = contractReply(to, data);
          if (result.success) return { jsonrpc: '2.0', id: call.id, result: result.returnData };
        }
        return { jsonrpc: '2.0', id: call.id, error: { code: -32000, message: 'Not available in this UI test' } };
      };
      await route.fulfill({ json: Array.isArray(body) ? body.map(reply) : reply(body) });
    });
    let signatures = 0;
    let verified = false;
    let verificationStatus = 0;
    let cookie = '';
    let nonceRequests = 0;
    await page.route('**/gateway/**', async (route) => {
      const request = route.request();
      if (request.url().endsWith('/auth/siwe/nonce')) nonceRequests++;
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
      expect(nonceRequests).toBe(1);
      await modal.getByRole('button', { name: 'Sign', exact: true }).click();
      await expect
        .poll(() => verificationStatus, { timeout: 20_000 })
        .toBe(validSignature ? 200 : 401);
      expect(signatures).toBe(1);
      expect(nonceRequests).toBe(1);
      if (validSignature) {
        await expect(page.locator('.mobile-status')).toContainText(
          'Owner verified.',
        );
        // A connected wallet and old MCP connection alone must not skip setup.
        await page.evaluate(() => window.history.pushState(null, '', '/?setup=1&from=test'));
        await expect.poll(() => balanceReads).toBeGreaterThan(0);
        await expect(page).toHaveURL(/setup=1/);
        await expect(page.locator('.mobile-agent-onboarding')).toBeVisible();
        nfatBalance = 1;
        await page.evaluate(() => window.history.pushState(null, '', '/?setup=1&from=test-owned#activity'));
        await expect(page).toHaveURL(/\/\?from=test-owned#activity$/);
        await expect(page.locator('.mobile-agent-onboarding')).toBeHidden();

        await page.getByRole('link', { name: 'Connect an agent', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Manage MCP connections' })).toBeVisible({ timeout: 20_000 });
        expect(signatures).toBe(1);
        await expect(page.locator('.agent-row')).toContainText('Existing agent');
        await page.locator('.desktop-host-picker').getByRole('button', { name: 'Generic MCP' }).click();
        await page.getByRole('button', { name: 'Create Generic MCP connection', exact: true }).click();
        await expect(page.locator('.agent-row')).toHaveCount(2);
        await expect(page.locator('.agent-row').last()).toContainText('Generic MCP connection');
        const token = await page.getByLabel('Agent connection key', { exact: true }).inputValue();
        const downloaded = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download agent setup (.md)', exact: true }).first().click();
        const download = await downloaded;
        expect(download.suggestedFilename()).toBe('wayleave-generic-setup.md');
        const guide = await readFile((await download.path())!, 'utf8');
        expect(guide).toContain('local stdio');
        expect(guide).toContain('get_account');
        expect(guide).toContain('<WAYLEAVE_AGENT_TOKEN>');
        expect(guide).not.toContain(token);
        await page.locator('.agent-row').last().getByRole('button', { name: 'Revoke' }).click();
        await expect(page.locator('.agent-row').last()).toContainText('Revoked');
        await expect(page.getByLabel('Agent connection key', { exact: true })).toHaveCount(0);
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({ path: `/tmp/wayleave-connect-${width}.png`, fullPage: true });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }

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
