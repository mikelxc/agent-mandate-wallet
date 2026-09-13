import { expect, test } from '@playwright/test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  decodeFunctionData,
  encodeFunctionResult,
  multicall3Abi,
  verifyMessage,
  type Address,
  type Hex,
} from 'viem';
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
    page.on('console', (message) => {
      if (message.type() === 'error') signingErrors.push(message.text());
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const owner = privateKeyToAccount(generatePrivateKey());
    const signer = validSignature
      ? owner
      : privateKeyToAccount(generatePrivateKey());
    const store = new Store(':memory:');
    const chain: Chain = {
      ownership: async () => ({
        owner: owner.address.toLowerCase(),
        tokenId: '1',
        epoch: '0',
      }),
      verifyLogin: (address, message, signature) =>
        verifyMessage({ address: address as Address, message, signature }),
      balances: async () => {
        throw new Error('Not used by connection tests');
      },
      prepare: async () => {
        throw new Error('Not used by connection tests');
      },
      verifyApproval: async () => {
        throw new Error('Not used by connection tests');
      },
      receipt: async () => {
        throw new Error('Not used by connection tests');
      },
    };
    const gateway = createHostedGateway(store, chain, [
      new URL(baseURL!).origin,
    ]);
    const seededAgent = await store.createAgent(
      {
        owner: owner.address.toLowerCase(),
        name: 'Existing agent',
        account: '0x1111111111111111111111111111111111111111',
        tokenHash: 'test-existing-token-hash',
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
      },
      Math.floor(Date.now() / 1000),
    );
    await store.propose(
      seededAgent,
      {
        chainId: 11155111,
        account: seededAgent.account,
        fundingOwner: owner.address.toLowerCase(),
        token: '0x2222222222222222222222222222222222222222',
        recipient: '0x3333333333333333333333333333333333333333',
        amount: '1000000',
        businessReference: 'Old payment request',
        idempotencyKey: 'expired-ui-test',
        expiresAt: Math.floor(Date.now() / 1000) - 60,
      },
      'expired-ui-test-hash',
      Math.floor(Date.now() / 1000) - 3600,
    );
    let nfatBalance = 0;
    let balanceReads = 0;
    await page.route(
      (url) =>
        url.hostname === new URL(sepolia.rpcUrls.default.http[0]).hostname ||
        url.hostname === 'rpc.walletconnect.org',
      async (route) => {
        const body = route.request().postDataJSON();
        if (!body) {
          await route.fulfill({ json: {} });
          return;
        }
        const contractReply = (
          target: string,
          data: Hex,
        ): { success: boolean; returnData: Hex } => {
          if (
            data.startsWith('0x70a08231') &&
            target.toLowerCase() === sepoliaDeployment.registry.toLowerCase()
          ) {
            expect(data.slice(-40).toLowerCase()).toBe(
              owner.address.slice(2).toLowerCase(),
            );
            balanceReads++;
            return {
              success: true,
              returnData: `0x${nfatBalance.toString(16).padStart(64, '0')}`,
            };
          }
          return { success: false, returnData: '0x' };
        };
        const reply = (call: any) => {
          if (call.method === 'eth_call') {
            const { to, data } = call.params[0];
            if (data.startsWith('0x82ad56cb')) {
              const decoded = decodeFunctionData({ abi: multicall3Abi, data });
              if (decoded.functionName === 'aggregate3') {
                const result = decoded.args[0].map((entry) =>
                  contractReply(entry.target, entry.callData),
                );
                return {
                  jsonrpc: '2.0',
                  id: call.id,
                  result: encodeFunctionResult({
                    abi: multicall3Abi,
                    functionName: 'aggregate3',
                    result,
                  }),
                };
              }
            }
            const result = contractReply(to, data);
            if (result.success)
              return { jsonrpc: '2.0', id: call.id, result: result.returnData };
          }
          return {
            jsonrpc: '2.0',
            id: call.id,
            error: { code: -32000, message: 'Not available in this UI test' },
          };
        };
        await route.fulfill({
          json: Array.isArray(body) ? body.map(reply) : reply(body),
        });
      },
    );
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
      if (outcome === 'provider-error')
        throw new Error('Wallet session expired; reconnect the wallet');
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
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
        await expect
          .poll(() => signingErrors.join('\n'))
          .toContain('Wallet session expired; reconnect the wallet');
        expect(signingErrors.join('\n')).not.toContain(
          'WagmiAdapter:signMessage - Sign message failed',
        );
        expect(verificationStatus).toBe(0);
        expect(signatures).toBe(1);
        expect(verified).toBe(false);
        expect(cookie).not.toContain('mandate_session=');
        await expect(page.locator('.arc-onboarding-status')).toContainText(
          'Sign-in failed: Wallet session expired; reconnect the wallet',
        );
        await expect(
          modal.getByRole('button', { name: 'Sign', exact: true }),
        ).toBeVisible();
        return;
      }
      await expect
        .poll(() => verificationStatus, { timeout: 20_000 })
        .toBe(validSignature ? 200 : 401);
      expect(signatures).toBe(1);
      expect(nonceRequests).toBe(1);
      if (validSignature) {
        await expect(page).toHaveURL(/\/payments$/);
        nfatBalance = 1;
        await page.getByRole('combobox', { name: 'Wallet network' }).click();
        await page.getByRole('option', { name: /Sepolia/ }).click();
        await expect(
          page.getByRole('link', { name: 'Add agent', exact: true }),
        ).toBeVisible();
        await page
          .getByRole('link', { name: 'Add agent', exact: true })
          .click();
        await expect(page).toHaveURL(/\/agents\/new$/);
        await expect(
          page.getByRole('heading', { name: 'Add an agent', exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'I understand. Name my wallet' })
          .click();
        await expect(page).toHaveURL(/\/agents\/new\?setup=3$/);
        await expect(
          page.getByLabel('Agent wallet name', { exact: true }),
        ).toBeVisible();
        await page
          .getByLabel('Agent wallet name', { exact: true })
          .fill('second-agent');
        await expect(
          page.getByRole('button', {
            name: 'Create wallet on Sepolia',
            exact: true,
          }),
        ).toBeEnabled();
        await page
          .getByRole('button', { name: 'Go to step 4: Add a chain' })
          .click();
        await expect(page).toHaveURL(/\/agents\/new\?setup=4$/);
        await page.goBack();
        await expect(
          page.getByLabel('Agent wallet name', { exact: true }),
        ).toHaveValue('second-agent');
        expect(signatures).toBe(1);
        // Stay in the app: a full reload resets this test's in-memory wallet provider.
        await page.getByRole('banner').getByRole('link').first().click();
        await page
          .getByRole('button', { name: 'Get started', exact: true })
          .click();
        await page.getByRole('button', { name: 'See how it works' }).click();
        await page
          .getByRole('button', { name: 'I understand. Name my wallet' })
          .click();
        await expect(
          page.getByLabel('Agent wallet name', { exact: true }),
        ).toBeVisible();
        await page
          .getByLabel('Agent wallet name', { exact: true })
          .fill('research-desk');
        await expect(
          page.getByRole('button', {
            name: 'Create wallet on Sepolia',
            exact: true,
          }),
        ).toBeEnabled();
        await expect(
          page.getByRole('complementary', {
            name: 'Your agent wallet explained',
          }),
        ).toContainText('research-desk.wayleave.eth');
        await page.screenshot({
          path: '/private/tmp/wayleave-named-wallet-signed-in.png',
          fullPage: true,
        });
        // Stored merchant evidence drives the timeline; the UI cannot advance it itself.
        const purchase = {
          id: '11111111-1111-4111-8111-111111111111',
          operationId: '22222222-2222-4222-8222-222222222222',
          paymentStatus: 'approval_required',
          delivery: 'locked',
          sourceTransactionHash: undefined as string | undefined,
          destinationTransactionHash: undefined as string | undefined,
          bundleSha256: undefined as string | undefined,
          quote: {
            createdAt: Math.floor(Date.now() / 1000),
            fundingOwner: owner.address,
            sourceDebit: '101000',
            offering: {
              id: 'wayleave-developer-pack',
              title: 'Wayleave Developer Pack',
              price: '100000',
              maxTransferFee: '1000',
              contentSha256: 'test-digest',
            },
          },
        };
        let reads = 0;
        await page.route('**/gateway/merchant/purchases', (route) => {
          reads++;
          return route.fulfill({ json: { purchases: [purchase] } });
        });
        await page
          .getByRole('button', { name: 'Go to step 6: Try a purchase' })
          .click();
        const tracker = page.getByRole('region', {
          name: 'Developer Pack purchase tracker',
        });
        await expect(
          tracker.getByText('Ready for your approval', { exact: true }),
        ).toBeVisible();
        await expect(tracker.locator('[data-complete=true]')).toHaveCount(1);
        const firstReads = reads;
        await expect
          .poll(() => reads, { timeout: 15000 })
          .toBeGreaterThan(firstReads);
        purchase.paymentStatus = 'settled';
        purchase.sourceTransactionHash = '0x' + '1'.repeat(64);
        purchase.destinationTransactionHash = '0x' + '2'.repeat(64);
        await tracker
          .getByRole('button', { name: 'Check purchase', exact: true })
          .click();
        await expect(tracker.locator('[data-complete=true]')).toHaveCount(4);
        await expect(
          tracker.getByRole('button', { name: 'Download purchased pack' }),
        ).toBeVisible();
        purchase.delivery = 'available';
        purchase.bundleSha256 = 'test-digest';
        await tracker
          .getByRole('button', { name: 'Check purchase', exact: true })
          .click();
        await expect(
          tracker.getByText('Purchase complete', { exact: true }),
        ).toBeVisible();
        await expect(tracker.locator('[data-complete=true]')).toHaveCount(5);
        await page.screenshot({
          path: '/tmp/wayleave-real-purchase-tracker-fixture.png',
          fullPage: true,
        });
        await page.evaluate(() =>
          window.dispatchEvent(
            new CustomEvent('wayleave:owner-session', { detail: null }),
          ),
        );
        await expect(
          tracker.getByText('Purchase complete', { exact: true }),
        ).toHaveCount(0);
        expect(signatures).toBe(1);
      } else {
        expect(verified).toBe(false);
        expect(cookie).not.toContain('mandate_session=');
        await expect(page.locator('.arc-onboarding-status')).not.toContainText(
          'Owner verified.',
        );
      }
    } finally {
      await page.unrouteAll({ behavior: 'wait' });
      store.close();
    }
  });
