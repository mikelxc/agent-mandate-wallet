import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../../../apps/gateway/src/store';
import { MerchantService, createMerchantRoute, developerOffering } from '../../../apps/gateway/src/merchant';
import { testCctpIntent as intent } from '../../../packages/sdk/src/cctp.fixtures';
import type { ArcChain } from '../../../apps/gateway/src/arc-chain';
import { verifyDelivery } from 'wayleave-merchant';

test('MCP purchase travels through the durable merchant gateway and only delivers after verified-adapter settlement', async () => {
  const store = new Store(':memory:');
  const buyer = { id: 'merchant-mcp-agent', owner: intent.fundingOwner, account: intent.account };
  const chain = { ownership: async () => ({ owner: buyer.owner, tokenId: '1', epoch: '1' }) } as Pick<ArcChain, 'ownership'>;
  const offering = { ...developerOffering(intent.recipient), price: '100000', maxTransferFee: '1000' };
  const route = createMerchantRoute({ store, chain, offering, audience: 'https://www.wayleave.xyz', authenticateAgent: async r => r.headers.get('authorization') === 'Bearer merchant-test' ? buyer : null });
  const service = new MerchantService(store, offering, chain, 'https://www.wayleave.xyz');
  const gateway = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: async r => await route(r) ?? new Response(null, { status: 404 }) });
  const transport = new StdioClientTransport({ command: process.execPath, args: [new URL('./server.ts', import.meta.url).pathname], env: { PATH: process.env.PATH!, WAYLEAVE_AGENT_TOKEN: 'merchant-test', WAYLEAVE_GATEWAY_URL: `http://127.0.0.1:${gateway.port}` }, stderr: 'pipe' });
  const client = new Client({ name: 'merchant-test', version: '1' });
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
  const data = (response: Awaited<ReturnType<typeof call>>) => JSON.parse((response.content as { text: string }[])[0].text);
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools.map(t => t.name)).toEqual(expect.arrayContaining(['list_offerings','get_purchase_quote','request_purchase','get_purchase','get_purchase_delivery']));
    expect(data(await call('list_offerings')).offerings[0].id).toBe(offering.id);
    const quote = data(await call('get_purchase_quote', { offeringId: offering.id, idempotencyKey: 'mcp-attempt-1' }));
    const purchase = data(await call('request_purchase', { quoteId: quote.id }));
    expect(purchase.approvalUrl).toContain(`/payments?request=${purchase.operationId}`);
    expect(data(await call('request_purchase', { quoteId: quote.id })).operationId).toBe(purchase.operationId);
    expect((await call('get_purchase_delivery', { purchaseId: purchase.id })).isError).toBe(true);
    const op = await service.operations.get(purchase.operationId, buyer.owner), hash = `0x${'ab'.repeat(32)}` as const;
    // Explicitly simulated output from the trusted chain adapter. Never presented as live evidence.
    await service.operations.save(op!, { status: 'settled', source: { transactionHash: hash, userOpHash: hash, blockNumber: '1', message: '0x', fingerprint: hash }, destination: { transactionHash: hash, blockNumber: '2', nonce: hash, merchantAmount: '100000' } }, 1);
    const delivery = data(await call('get_purchase_delivery', { purchaseId: purchase.id }));
    await verifyDelivery(delivery, quote.offering.contentSha256);
    expect(data(await call('get_purchase', { purchaseId: purchase.id })).delivery).toBe('available');
  } finally { await client.close(); gateway.stop(true); await service.ready; store.close(); }
}, 20_000);
