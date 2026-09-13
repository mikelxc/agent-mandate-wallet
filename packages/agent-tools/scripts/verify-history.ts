/** Read-only MCP acceptance check: live RPC/index, disposable local authentication. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tmpdir } from 'node:os';
import { Store } from '../../../apps/gateway/src/store';
import { createApp, hashToken } from '../../../apps/gateway/src/app';
import { arcDeploymentFromEnv, liveArcChain } from '../../../apps/gateway/src/arc-chain';
import type { Address } from 'viem';
import { liveChain } from '../../../apps/gateway/src/chain';
import { historyFromEnv } from '../../../apps/gateway/src/history';

const account = process.env.WAYLEAVE_GRAPH_VERIFY_ACCOUNT;
if (!account) throw new Error('Configure WAYLEAVE_GRAPH_VERIFY_ACCOUNT');
const chainId = Number(process.env.WAYLEAVE_GRAPH_VERIFY_CHAIN_ID ?? 11155111);
if (![11155111, 5042002].includes(chainId)) throw new Error('Unsupported verification chain');
const chain = liveChain();
const arcDeployment = arcDeploymentFromEnv();
if (chainId === 5042002 && !arcDeployment) throw new Error('Configure Arc deployment');
const ownershipChain = chainId === 5042002 ? liveArcChain(arcDeployment!) : chain;
const owner = (await ownershipChain.ownership(account as Address)).owner.toLowerCase();
const store = new Store(':memory:');
await store.db.ready;
const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const now = Math.floor(Date.now() / 1000);
const publishedVersion = process.env.WAYLEAVE_VERIFY_PUBLISHED_MCP;
if (publishedVersion && !/^\d+\.\d+\.\d+$/.test(publishedVersion)) throw new Error('Use an exact published MCP version');
await store.createAgent({ name: 'live-history-verification', owner, account: account.toLowerCase(), tokenHash: hashToken(token), expiresAt: now + 300 }, now);
let handler: ReturnType<typeof createApp>;
const gateway = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: request => handler(request) });
handler = createApp(store, chain, { gatewayOrigin: gateway.url.origin, history: historyFromEnv(), ...(chainId === 5042002 ? {
  authenticateScopedAgent: async (request: Request, requiredChain?: number) => {
    if (Math.floor(Date.now() / 1000) >= now + 300) return null;
    if (request.headers.get('authorization') !== `Bearer ${token}` || (requiredChain !== undefined && requiredChain !== chainId)) return null;
    if ((await ownershipChain.ownership(account as Address)).owner.toLowerCase() !== owner) return null;
    return { id: 'live-arc-history-fixture', name: 'live-history-verification', owner, account: account.toLowerCase(), chainId,
      scopes: ['read'], expiresAt: now + 300, revokedAt: null, createdAt: now };
  },
} : {}) });
const transport = new StdioClientTransport({ command: process.execPath,
  args: publishedVersion ? ['x', `wayleave-mcp@${publishedVersion}`] : [new URL('../src/server.ts', import.meta.url).pathname], cwd: tmpdir(),
  env: { PATH: process.env.PATH ?? '', WAYLEAVE_AGENT_TOKEN: token, WAYLEAVE_GATEWAY_URL: gateway.url.origin }, stderr: 'pipe' });
const client = new Client({ name: 'live-history-verification', version: '1.0.0' });
try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map(tool => tool.name);
  const mode = Bun.argv[2];
  if (mode === '--list') {
    console.log(JSON.stringify(await client.listTools(), null, 2));
  } else if (mode === '--call') {
    const name = Bun.argv[3];
    if (!['get_account', 'list_payments', 'get_payment_context', 'summarize_spending'].includes(name)) throw new Error('Read-only evaluation tools only');
    console.log(JSON.stringify(await client.callTool({name, arguments: JSON.parse(Bun.argv[4] ?? '{}')}), null, 2));
  } else {
  async function call(name: string, args: Record<string, unknown>) {
    if (!tools.includes(name)) throw new Error(`Missing ${name}`);
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(`MCP ${name} failed`);
    const content = result.content as {type:string;text?:string}[];
    const data = JSON.parse(content.find(item => item.type === 'text')?.text ?? '{}');
    if (data.coverage?.chainId !== chainId) throw new Error(`MCP ${name} returned the wrong chain`);
    if (data.coverage?.status !== 'indexed') throw new Error(`MCP ${name} did not return healthy live data`);
    return data;
  }
  const list = await call('list_payments', { first: 10, chainId });
  if (!list.items?.length && !process.env.WAYLEAVE_GRAPH_VERIFY_TRANSACTION) throw new Error('Live sample transfer or explicit context transaction required');
  const context = await call('get_payment_context', { transactionHash: list.items[0]?.transactionHash ?? process.env.WAYLEAVE_GRAPH_VERIFY_TRANSACTION, chainId });
  const summary = await call('summarize_spending', { groupBy: 'merchant', chainId });
  console.log(JSON.stringify({ verifiedAt: new Date().toISOString(), mcp: publishedVersion ? `wayleave-mcp@${publishedVersion}` : 'local_source', authentication: 'ephemeral_local_fixture', data: 'live_graph_and_chain_rpc', chainId, account, owner,
    tools: ['list_payments', 'get_payment_context', 'summarize_spending'], transferIds: list.items.map((item: {id:string}) => item.id),
    contextTransfers: context.transfers.length, summary, coverage: list.coverage }, null, 2));
  }
} finally { await client.close(); gateway.stop(true); store.close(); }
