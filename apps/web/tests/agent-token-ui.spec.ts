import { expect, test } from '@playwright/test';
import { privateKeyToAccount } from 'viem/accounts';
import {
  decodeFunctionData,
  encodeFunctionResult,
  multicall3Abi,
  hexToString,
  verifyMessage,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  identityFingerprint,
  portableIdentityDeployment,
  type PortableIdentity,
} from '@mandate/sdk';
import { sepolia } from 'viem/chains';
import { Store } from '../../gateway/src/store';
import { createApp } from '../../gateway/src/app';
import {
  createIdentityAuth,
  createIdentityRoutes,
} from '../../gateway/src/identity-auth';
import { createIdentityAssociations } from '../../gateway/src/identity-associations';
import { createAgentTokens } from '../../gateway/src/agent-tokens';
import type { Chain } from '../../gateway/src/chain';

test.setTimeout(60_000);
for (const existingWallet of [false, true])
  test(
    existingWallet
      ? 'existing wallet leaves setup and can still manage agent connections'
      : 'owner chooses session length, signs its exact grant, copies a safe prompt and revokes the token',
    async ({ page, context, baseURL }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const owner = privateKeyToAccount(`0x${'19'.repeat(32)}`);
      const account = '0x1111111111111111111111111111111111111111';
      const origin = new URL(baseURL!).origin;
      const store = new Store(':memory:');
      const identity: PortableIdentity = {
        name: 'research.eth',
        deployment: portableIdentityDeployment,
        chainId: 11155111,
        registry: owner.address,
        controller: owner.address,
        resolver: zeroAddress,
        subregistry: zeroAddress,
        registration: identityFingerprint('token-ui'),
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 86400,
        canSetSubregistry: false,
      };
      const auth = createIdentityAuth({
        db: store.db,
        audience: origin,
        resolver: {
          discover: async () => structuredClone(identity),
          membership: async () => {
            throw new Error('Enrollment must not be needed');
          },
          verify: (address, message, signature) =>
            verifyMessage({ address, message, signature }),
        },
      });
      const associations = createIdentityAssociations(store.db, auth, {
        ownership: async () => ({ controller: owner.address, epoch: '1' }),
        verify: (_chain, address, message, signature) =>
          verifyMessage({ address, message, signature }),
      });
      const login = await auth.challenge({
        deployment: portableIdentityDeployment,
        kind: 'owner',
        name: identity.name,
      });
      const seed = await auth.verify(
        login.proof.nonce,
        await owner.signMessage({ message: login.message }),
      );
      const association = await associations.challenge(
        seed.token,
        5042002,
        account,
      );
      await associations.attach(
        seed.token,
        association.binding.nonce,
        await owner.signMessage({ message: association.message }),
      );
      const tokens = createAgentTokens(store, auth, associations, origin);
      const chain: Chain = {
        ownership: async () => ({
          owner: owner.address,
          tokenId: '1',
          epoch: '1',
        }),
        verifyLogin: (address, message, signature) =>
          verifyMessage({ address: address as Address, message, signature }),
        balances: async () => {
          throw new Error('Not needed');
        },
        prepare: async () => {
          throw new Error('No payment');
        },
        verifyApproval: async () => false,
        receipt: async () => {
          throw new Error('No payment');
        },
      };
      const gateway = createApp(store, chain, {
        dashboardOrigin: origin,
        gatewayOrigin: origin,
        routes: [createIdentityRoutes(auth, origin, associations, tokens)],
        authenticateScopedAgent: (request) =>
          tokens.authenticate(request, 11155111),
      });
      if (existingWallet)
        await page.route(
          (url) =>
            url.hostname ===
              new URL(sepolia.rpcUrls.default.http[0]).hostname ||
            url.hostname === 'rpc.walletconnect.org',
          async (route) => {
            const body = route.request().postDataJSON();
            const reply = (call: any) => {
              const one = `0x${'1'.padStart(64, '0')}` as Hex;
              if (call?.method === 'eth_call') {
                const data = call.params[0].data as Hex;
                if (data.startsWith('0x82ad56cb')) {
                  const decoded = decodeFunctionData({
                    abi: multicall3Abi,
                    data,
                  });
                  if (decoded.functionName === 'aggregate3')
                    return {
                      jsonrpc: '2.0',
                      id: call.id,
                      result: encodeFunctionResult({
                        abi: multicall3Abi,
                        functionName: 'aggregate3',
                        result: decoded.args[0].map((entry) => ({
                          success: entry.callData.startsWith('0x70a08231'),
                          returnData: entry.callData.startsWith('0x70a08231')
                            ? one
                            : '0x',
                        })),
                      }),
                    };
                }
                if (data.startsWith('0x70a08231'))
                  return { jsonrpc: '2.0', id: call.id, result: one };
              }
              return {
                jsonrpc: '2.0',
                id: call?.id ?? null,
                error: { code: -32000, message: 'Not used' },
              };
            };
            await route.fulfill({
              json: Array.isArray(body) ? body.map(reply) : reply(body),
            });
          },
        );
      let cookie = existingWallet ? `wayleave_identity=${seed.token}` : '',
        bearer = '',
        signedGrant = '';
      await page.route('**/gateway/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        url.pathname = url.pathname.replace(/^\/gateway/, '');
        const headers = new Headers(await request.allHeaders());
        if (cookie) headers.set('cookie', cookie);
        const response = await gateway(
          new Request(url, {
            method: request.method(),
            headers,
            body: request.postData() ?? undefined,
          }),
        );
        const nextCookie = response.headers.get('set-cookie');
        if (nextCookie) {
          const value = nextCookie.split(';')[0];
          cookie = [
            ...cookie
              .split('; ')
              .filter(
                (item) => item && !item.startsWith(value.split('=')[0] + '='),
              ),
            value,
          ].join('; ');
        }
        const body = await response.text();
        if (url.pathname === '/identity/tokens/issue' && response.ok)
          bearer = JSON.parse(body).token;
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body,
        });
      });
      await page.exposeFunction('signAgentTokenTest', async (raw: Hex) => {
        const message = hexToString(raw);
        if (message.startsWith('Wayleave agent bearer token'))
          signedGrant = message;
        return owner.signMessage({ message: { raw } });
      });
      await page.addInitScript(
        ({ address }) => {
          let connected = sessionStorage.getItem('token-test-connected') === 'true';
          const provider = {
            isMetaMask: true,
            on() {},
            removeListener() {},
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
                sessionStorage.setItem('token-test-connected', 'true');
                return [address];
              }
              if (method === 'eth_chainId') return '0xaa36a7';
              if (method === 'wallet_getCapabilities') return {};
              if (method === 'wallet_requestPermissions') {
                connected = true;
                sessionStorage.setItem('token-test-connected', 'true');
                return [{ parentCapability: 'eth_accounts' }];
              }
              if (method === 'personal_sign')
                return (window as any).signAgentTokenTest(params![0]);
              throw new Error(`Test wallet rejects ${method}`);
            },
          };
          Object.defineProperty(window, 'ethereum', { value: provider });
          const announce = () =>
            window.dispatchEvent(
              new CustomEvent('eip6963:announceProvider', {
                detail: {
                  info: {
                    uuid: '894c2487-1ae0-43f5-a532-7417d1ee09c2',
                    name: 'Bearer Test Wallet',
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                    rdns: 'test.wayleave.bearer',
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
        await page.goto('/connect');
        await page.getByLabel('ENS name', { exact: true }).fill(identity.name);
        await page
          .getByRole('button', { name: 'Look up name', exact: true })
          .click();
        await page
          .getByRole('button', {
            name: 'Connect Bearer Test Wallet',
            exact: true,
          })
          .click();
        const modal = page.locator('w3m-modal');
        await modal.getByRole('button', { name: 'Sign', exact: true }).click();
        await expect(modal).not.toHaveClass(/open/);

        if (!existingWallet) {
          await page.getByLabel('ENS name', { exact: true }).fill(identity.name);
          await page
            .getByRole('button', { name: 'Look up name', exact: true })
            .click();
          await page
            .getByRole('button', {
              name: 'Verify with your wallet',
              exact: true,
            })
            .click();
        }
        await expect(
          page.getByRole('navigation', { name: 'Onboarding steps' }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: /Create wallet on/ }),
        ).toHaveCount(0);
        const manager = page.getByRole('region', {
          name: 'Agent bearer tokens',
        });
        await expect(
          manager.getByLabel('Associated Arc account'),
        ).toContainText(account);
        await manager.getByLabel('Session length', { exact: true }).click();
        await page.getByRole('option', { name: '7 days', exact: true }).click();
        await manager
          .getByRole('button', { name: 'Sign and grant access' })
          .click();
        await expect(manager.getByRole('status')).toContainText(
          'Token created',
        );
        expect(
          JSON.parse(signedGrant.split('\n').at(-1)!).durationSeconds,
        ).toBe(604800);
        expect(bearer).toMatch(/^[a-f0-9]{64}$/);
        await expect(
          manager.getByLabel('Public authentication address'),
        ).toHaveCount(0);
        await manager
          .getByText('Ask an agent to help you set up', { exact: true })
          .click();
        await manager
          .getByRole('button', { name: 'Copy setup prompt' })
          .click();
        const prompt = await page.evaluate(() =>
          navigator.clipboard.readText(),
        );
        expect(prompt).toContain('WAYLEAVE_AGENT_TOKEN');
        expect(prompt).not.toContain(bearer);
        expect(prompt).not.toContain('WAYLEAVE_ENS_AGENT_PRIVATE_KEY');
        await manager.getByText('Show MCP settings', { exact: true }).click();
        await manager
          .getByRole('button', { name: 'Copy private MCP settings' })
          .click();
        expect(
          await page.evaluate(() => navigator.clipboard.readText()),
        ).toContain(bearer);
        await manager
          .getByRole('button', {
            name: 'Revoke assistant.research.eth',
            exact: true,
          })
          .click();
        await expect(
          manager.getByText('Revoked', { exact: true }),
        ).toBeVisible();
        await expect(
          manager.getByRole('button', { name: 'Copy private MCP settings' }),
        ).toBeDisabled();
        expect(
          await tokens.authenticate(
            new Request(`${origin}/agent/account`, {
              headers: { Authorization: `Bearer ${bearer}` },
            }),
          ),
        ).toBeNull();
        if (existingWallet) {
          await page.goto('/?setup=3&source=regression#preview');
          await expect(page).toHaveURL(/\/payments\?source=regression#preview$/);
          await page
            .getByRole('link', { name: 'Add agent', exact: true })
            .click();
          await expect(page).toHaveURL(/\/agents\/new$/);
          await expect(page.getByLabel('Associated Arc account')).toContainText(
            account,
          );
        }
        await page.screenshot({
          path: '/private/tmp/wayleave-bearer-tokens.png',
          fullPage: true,
        });
      } finally {
        store.close();
      }
    },
  );
