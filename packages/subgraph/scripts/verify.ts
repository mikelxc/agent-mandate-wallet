import { createPublicClient, decodeEventLog, http, parseAbi } from "viem";
import { historyFromEnv } from "../../../apps/gateway/src/history";

// Read-only verification. Prints public evidence, never provider URLs or credentials.
const account = process.env.WAYLEAVE_GRAPH_VERIFY_ACCOUNT;
const rpc = process.env.SEPOLIA_RPC_URL;
if (!account || !rpc || process.env.WAYLEAVE_GRAPH_CHAIN_ID !== "11155111")
  throw new Error("Set WAYLEAVE_GRAPH_VERIFY_ACCOUNT, SEPOLIA_RPC_URL and the Sepolia history configuration");
const history = historyFromEnv();
const page = await history.list(account, { chainId: 11155111, first: 10 });
if (page.coverage.status !== "indexed" || page.items.length === 0)
  throw new Error("A healthy index with sample transfers is required; no live evidence recorded");
const client = createPublicClient({ transport: http(rpc) });
if (await client.getChainId() !== 11155111) throw new Error("Sepolia RPC required");
const abi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
for (const item of page.items) {
  const receipt = await client.getTransactionReceipt({ hash: item.transactionHash as `0x${string}` });
  const log = receipt.logs.find(log => log.logIndex === Number(item.logIndex));
  if (!log || receipt.blockHash.toLowerCase() !== item.blockHash || receipt.blockNumber.toString() !== item.blockNumber || log.address.toLowerCase() !== item.token)
    throw new Error("Indexed transfer does not match canonical receipt");
  const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
  if (event.args.from.toLowerCase() !== item.from || event.args.to.toLowerCase() !== item.to || event.args.value.toString() !== item.amount)
    throw new Error("Indexed token effects do not match canonical receipt");
}
console.log(JSON.stringify({ verifiedAt: new Date().toISOString(), network: "sepolia", coverage: page.coverage, canonicalReferences: page.items.map(item => item.id) }, null, 2));
