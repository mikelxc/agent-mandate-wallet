/** Read-only MCP acceptance check: live RPC/index, disposable local authentication. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tmpdir } from 'node:os';
import { Store } from '../../../apps/gateway/src/store';
import { createApp, hashToken } from '../../../apps/gateway/src/app';
import { liveChain } from '../../../apps/gateway/src/chain';
import { historyFromEnv } from '../../../apps/gateway/src/history';

const account = process.env.WAYLEAVE_GRAPH_VERIFY_ACCOUNT;
if (!account) throw new Error('Configure WAYLEAVE_GRAPH_VERIFY_ACCOUNT');
const chain = liveChain();
const owner = (await chain.ownership(account)).owner.toLowerCase();
const store = new Store(':memory:');
await store.db.ready;
const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
const now = Math.floor(Date.now() / 1000);
await store.createAgent({ name: 'live-history-verification', owner, account: account.toLowerCase(), tokenHash: hashToken(token), expiresAt: now + 300 }, now);
let handler: ReturnType<typeof createApp>;
const gateway = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: request => handler(request) });
handler = createApp(store, chain, { gatewayOrigin: gateway.url.origin, history: historyFromEnv() });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [new URL('../src/server.ts', import.meta.url).pathname], cwd: tmpdir(),
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
    if (data.coverage?.status !== 'indexed') throw new Error(`MCP ${name} did not return healthy live data`);
    return data;
  }
  const list = await call('list_payments', { first: 10, chainId: 11155111 });
  if (!list.items?.length) throw new Error('Live sample transfers required');
  const context = await call('get_payment_context', { transactionHash: list.items[0].transactionHash, chainId: 11155111 });
  const summary = await call('summarize_spending', { groupBy: 'merchant', chainId: 11155111 });
  console.log(JSON.stringify({ verifiedAt: new Date().toISOString(), authentication: 'ephemeral_local_fixture', data: 'live_graph_and_sepolia_rpc', account, owner,
    tools: ['list_payments', 'get_payment_context', 'summarize_spending'], transferIds: list.items.map((item: {id:string}) => item.id),
    contextTransfers: context.transfers.length, summary, coverage: list.coverage }, null, 2));
  }
} finally { await client.close(); gateway.stop(true); store.close(); }
