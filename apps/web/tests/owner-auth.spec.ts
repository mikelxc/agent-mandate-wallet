import { expect, test } from '@playwright/test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { decodeFunctionData, encodeFunctionResult, multicall3Abi, verifyMessage, type Address, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { sepoliaDeployment } from '@mandate/sdk';
import { Store } from '../../gateway/src/store';
import { createHostedGateway } from '../../gateway/src/hosted';
import type { Chain } from '../../gateway/src/chain';

test.setTimeout(60_000);

for (const outcome of ['valid', 'wrong-wallet', 'provider-error'] as const)
  test(`Reown wallet flow ${outcome === 'valid' ? 'verifies ownership' : outcome === 'wrong-wallet' ? 'rejects a wrong-wallet signature' : 'preserves the wallet signing error'}`, async ({
    page,
    context,
    baseURL,
  }) => {
    const validSignature = outcome === 'valid';
    const signingErrors: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') signingErrors.push(message.text());
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
    const seededAgent = await store.createAgent({ owner: owner.address.toLowerCase(), name: 'Existing agent', account: '0x1111111111111111111111111111111111111111', tokenHash: 'test-existing-token-hash', expiresAt: Math.floor(Date.now() / 1000) + 86400 }, Math.floor(Date.now() / 1000));
    await store.propose(seededAgent, {
      chainId: 11155111,
      account: seededAgent.account,
      fundingOwner: owner.address.toLowerCase(),
      token: '0x2222222222222222222222222222222222222222',
      recipient: '0x3333333333333333333333333333333333333333',
      amount: '1000000',
      businessReference: 'Old payment request',
      idempotencyKey: 'expired-ui-test',
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    }, 'expired-ui-test-hash', Math.floor(Date.now() / 1000) - 3600);
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
      if (outcome === 'provider-error') throw new Error('Wallet session expired; reconnect the wallet');
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
      if (outcome === 'provider-error') {
        await expect.poll(() => signingErrors.join('\n')).toContain('Wallet session expired; reconnect the wallet');
        expect(signingErrors.join('\n')).not.toContain('WagmiAdapter:signMessage - Sign message failed');
        expect(verificationStatus).toBe(0);
        expect(signatures).toBe(1);
        expect(verified).toBe(false);
        expect(cookie).not.toContain('mandate_session=');
        await expect(modal.getByRole('button', { name: 'Sign', exact: true })).toBeVisible();
        return;
      }
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
        await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible({ timeout: 20_000 });
        expect(signatures).toBe(1);
        await expect(page.locator('.connection-roster-row')).toContainText('Existing agent');
        await page.getByRole('button', { name: 'Add connection', exact: true }).click();
        await page.locator('.desktop-host-picker').getByRole('button', { name: 'Generic MCP' }).click();
        await page.getByRole('button', { name: 'Create Generic MCP connection', exact: true }).click();
        await expect(page.locator('.connection-roster-row')).toHaveCount(2);
        await expect(page.locator('.connection-roster-row').last()).toContainText('Generic MCP connection');
        await page.getByRole('button', { name: 'Copy Generic MCP setup', exact: true }).click();
        await expect(page.locator('.mobile-status')).toContainText('Generic MCP setup copied.');
        const setup = await page.evaluate(() => navigator.clipboard.readText());
        expect(setup).toContain('WAYLEAVE_AGENT_TOKEN');
        expect(setup).not.toContain('<create-a-generic-connection>');
        await page.getByRole('button', { name: 'Done', exact: true }).click();
        await page.locator('.connection-roster-row').last().getByRole('button', { name: 'Revoke' }).click();
        await expect(page.locator('.connection-roster-row')).toHaveCount(1);
        const agentArchive = page.locator('.archived-records').filter({ hasText: 'Past connections' });
        await expect(agentArchive).not.toHaveAttribute('open', '');
        await agentArchive.locator('summary').click();
        await expect(agentArchive.locator('.archive-row')).toContainText('Revoked');
        await agentArchive.getByRole('button', { name: 'Hide Generic MCP connection', exact: true }).click();
        await expect(agentArchive.locator('.archive-row')).toHaveCount(0);

        await expect(page.getByText('Finish in Generic MCP', { exact: true })).toHaveCount(0);
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({ path: `/tmp/wayleave-connect-${width}.png`, fullPage: true });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }

        await page.getByRole('link', { name: 'Spending', exact: true }).click();
        const activityArchive = page.locator('.archived-records').filter({ hasText: 'Expired activity' });
        await expect(activityArchive).not.toHaveAttribute('open', '');
        await activityArchive.locator('summary').click();
        await expect(activityArchive.locator('.archive-row')).toContainText('Old payment request');
        await expect(page.locator('.operation-card')).toHaveCount(0);
        await activityArchive.getByRole('link', { name: 'View', exact: true }).click();
        await expect(page.locator('.operation-card')).toContainText('Old payment request');
        await page.getByRole('button', { name: 'View all payments', exact: true }).click();
        await activityArchive.locator('summary').click();
        await activityArchive.getByRole('button', { name: 'Hide all', exact: true }).click();
        await expect(activityArchive.locator('.archive-row')).toHaveCount(0);
        await page.getByRole('link', { name: 'Connect an agent', exact: true }).click();
        await agentArchive.locator('summary').click();
        await expect(agentArchive.locator('.archive-row')).toHaveCount(0);
        await agentArchive.getByRole('button', { name: 'Restore hidden (1)', exact: true }).click();
        await expect(agentArchive.locator('.archive-row')).toHaveCount(1);
        await agentArchive.getByRole('button', { name: 'Hide all', exact: true }).click();
        await expect(agentArchive.locator('.archive-row')).toHaveCount(0);

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
