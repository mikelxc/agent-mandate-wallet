/** Indexed public facts. RPC execution receipts and private delivery remain separate. */
export type HistoryFilters = { chainId?: number; from?: number; to?: number; first?: number; cursor?: string };
export type HistoryConfig = { chainId: number; endpoint: string; deployment: string; startBlock: number; token: string; apiKey?: string };
export type IndexedTransfer = {
  id: string; account: string; from: string; to: string; amount: string; token: string;
  transactionHash: string; logIndex: string; blockNumber: string; blockHash: string; timestamp: string;
  userOpHash: string | null;
};
export class HistoryInputError extends Error {}
const address = /^0x[0-9a-f]{40}$/i;
const hash = /^0x[0-9a-f]{64}$/i;
const zero = "0x" + "0".repeat(40);
const fields = "id account from to amount token transactionHash logIndex blockNumber blockHash timestamp userOpHash";
const meta = "_meta { deployment hasIndexingErrors block { number hash timestamp } }";
export function parseHistoryFilters(input: Record<string, unknown>): HistoryFilters {
  const result: HistoryFilters = {};
  for (const key of ["chainId", "from", "to", "first"] as const) {
    if (input[key] === undefined || input[key] === null || input[key] === "") continue;
    const value = Number(input[key]);
    if (!Number.isSafeInteger(value) || value < 0) throw new HistoryInputError(`Invalid ${key}`);
    result[key] = value;
  }
  if (result.first !== undefined && (result.first < 1 || result.first > 100)) throw new HistoryInputError("first must be 1–100");
  if (result.from !== undefined && result.to !== undefined && result.from > result.to) throw new HistoryInputError("Invalid date range");
  if (input.cursor !== undefined && input.cursor !== null && input.cursor !== "") {
    if (typeof input.cursor !== "string" || !/^[0-9]+:0x[0-9a-f]{64}:[0-9]+$/i.test(input.cursor)) throw new HistoryInputError("Invalid cursor");
    result.cursor = input.cursor;
  }
  return result;
}
export class HistoryService {
  constructor(private configs: HistoryConfig[] = [], private fetchImpl: typeof fetch = fetch) {
    const chains = new Set<number>();
    for (const config of configs) {
      const url = new URL(config.endpoint);
      if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || !address.test(config.token) ||
          !Number.isSafeInteger(config.startBlock) || config.startBlock < 0 || !Number.isSafeInteger(config.chainId) || config.chainId < 1 ||
          !config.deployment || chains.has(config.chainId)) throw new Error("Invalid history provider configuration");
      chains.add(config.chainId);
    }
  }
  private config(filters: HistoryFilters) {
    if (filters.chainId !== undefined) return this.configs.find(c => c.chainId === filters.chainId);
    return this.configs.find(c => c.chainId === 11155111) ?? this.configs[0];
  }
  private scope(account: string, input: HistoryFilters) {
    if (!address.test(account)) throw new HistoryInputError("Invalid authorized account");
    return { account: account.toLowerCase(), filters: parseHistoryFilters(input) };
  }
  private async query(config: HistoryConfig, query: string, variables: Record<string, unknown>) {
    try {
      const response = await this.fetchImpl(config.endpoint, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json", ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
        body: JSON.stringify({ query, variables }),
      });
      if (!response.ok) return null;
      const result = await response.json() as any;
      const indexed = result.data?._meta;
      if (result.errors?.length || !indexed || indexed.deployment !== config.deployment || typeof indexed.hasIndexingErrors !== "boolean" ||
        !Number.isSafeInteger(indexed.block?.number) || indexed.block.number < config.startBlock || !hash.test(indexed.block?.hash ?? "")) return null;
      return result.data;
    } catch { return null; }
  }
  private coverage(config: HistoryConfig | undefined, data: any, chainId?: number) {
    return {
      kind: "indexed_history" as const, chainId: config?.chainId ?? chainId ?? 11155111,
      status: !config ? "not_configured" : !data ? "unavailable" : data._meta.hasIndexingErrors ? "indexing_errors" : "indexed",
      deployment: config?.deployment ?? null, coverageStartBlock: config?.startBlock ?? null,
      indexedBlock: data?._meta.block ?? null, hasIndexingErrors: data?._meta.hasIndexingErrors ?? null,
      scope: "Configured token transfers attributed to registered accounts; excludes activity before the manifest start block. Indexing may lag. Not proof of service delivery or cross-chain settlement.",
    };
  }
  async list(authorizedAccount: string, input: HistoryFilters = {}) {
    const { account, filters } = this.scope(authorizedAccount, input);
    const config = this.config(filters);
    const first = filters.first ?? 50;
    const where = { account, timestamp_gte: String(filters.from ?? 0), timestamp_lte: String(filters.to ?? 253402300799), ...(filters.cursor ? { id_gt: filters.cursor } : {}) };
    const data = config ? await this.query(config, `query Payments($where: PaymentTransfer_filter!, $first: Int!) { paymentTransfers(where: $where, first: $first, orderBy: id, orderDirection: asc) { ${fields} } ${meta} }`, { where, first: first + 1 }) : null;
    const rows = this.rows(data, account, config);
    const validData = rows === null ? null : data;
    const items = (rows ?? []).slice(0, first);
    return { items, nextCursor: (rows?.length ?? 0) > first ? items.at(-1)!.id : null, coverage: this.coverage(config, validData, filters.chainId) };
  }
  private rows(data: any, account: string, config: HistoryConfig | undefined): IndexedTransfer[] | null {
    if (!data || !Array.isArray(data.paymentTransfers) || data.paymentTransfers.length > 101 || !config) return null;
    const rows = data.paymentTransfers as IndexedTransfer[];
    if (rows.some(r => !r || typeof r !== "object" || r.account !== account || r.token !== config.token.toLowerCase() ||
      !address.test(r.from) || !address.test(r.to) || !hash.test(r.transactionHash) || !hash.test(r.blockHash) ||
      !/^\d+$/.test(r.amount) || !/^\d+$/.test(r.blockNumber) || !/^\d+$/.test(r.logIndex) || !/^\d+$/.test(r.timestamp) ||
      r.id !== `${config.chainId}:${r.transactionHash}:${r.logIndex}`) || new Set(rows.map(r => r.id)).size !== rows.length) return null;
    return rows;
  }
  async context(authorizedAccount: string, input: { chainId?: number; transactionHash: string }) {
    const { account, filters } = this.scope(authorizedAccount, { chainId: input.chainId });
    if (!hash.test(input.transactionHash)) throw new HistoryInputError("Invalid transaction hash");
    const config = this.config(filters);
    const tx = input.transactionHash.toLowerCase();
    const data = config ? await this.query(config, `query Context($account: Bytes!, $tx: Bytes!) { paymentTransfers(where: {account: $account, transactionHash: $tx}, first: 101, orderBy: id) { ${fields} } userOperations(where: {account: $account, transactionHash: $tx}, first: 101) { id account transactionHash userOpHash success blockNumber blockHash logIndex timestamp } ${meta} }`, { account, tx }) : null;
    const rows = this.rows(data, account, config);
    const operations = data?.userOperations;
    const valid = rows !== null && Array.isArray(operations) && operations.length <= 101 && rows.every(r => r.transactionHash === tx) && operations.every((o: any) => o && typeof o === "object" && o.account === account && o.transactionHash === tx && typeof o.success === "boolean" && hash.test(o.userOpHash));
    return { transfers: valid ? rows.slice(0, 100) : [], userOperations: valid ? operations.slice(0, 100) : [], truncated: valid && (rows.length > 100 || operations.length > 100), coverage: this.coverage(config, valid ? data : null, filters.chainId), settlement: "Not established by these indexed events; destination receipt and verified protocol message are required.", delivery: "Not established by indexed events." };
  }
  async summarize(authorizedAccount: string, input: HistoryFilters & { groupBy?: "merchant" | "chain" } = {}) {
    if (input.groupBy !== undefined && !["merchant", "chain"].includes(input.groupBy)) throw new HistoryInputError("Invalid grouping");
    if (input.cursor) throw new HistoryInputError("Summary does not accept a cursor");
    const page = await this.list(authorizedAccount, { ...input, first: 100 });
    const groups = new Map<string, { key: string; token: string; amount: bigint; references: string[] }>();
    for (const row of page.items) {
      // Ignore burns, mints, and account funding. Never interpret Circle burn+mint as two purchases.
      if (row.to === zero || row.from === zero || row.to === authorizedAccount.toLowerCase()) continue;
      const key = input.groupBy === "chain" ? String(page.coverage.chainId) : row.to;
      const group = groups.get(key) ?? { key, token: row.token, amount: 0n, references: [] };
      group.amount += BigInt(row.amount); group.references.push(row.id); groups.set(key, group);
    }
    return { groups: [...groups.values()].map(g => ({ ...g, amount: g.amount.toString() })), unit: "token_base_units", meaning: "Observed outgoing token transfers, not confirmed purchases; burns, mints and account funding excluded.", complete: false, boundedResultComplete: page.nextCursor === null && page.coverage.status === "indexed", truncated: page.nextCursor !== null, coverage: page.coverage, limit: 100 };
  }
}
/** Server-only config. Endpoints and credentials are never supplied by MCP callers. */
export function historyFromEnv(env: Record<string, string | undefined> = process.env) {
  const configs: HistoryConfig[] = [];
  for (const prefix of ["WAYLEAVE_GRAPH", "WAYLEAVE_ARC_GRAPH"]) {
    const value = (key: string) => env[`${prefix}_${key}`];
    if (!["ENDPOINT", "DEPLOYMENT", "TOKEN", "START_BLOCK", "CHAIN_ID", "API_KEY"].some(key => value(key))) continue;
    if (!["ENDPOINT", "DEPLOYMENT", "TOKEN", "START_BLOCK", "CHAIN_ID"].every(key => value(key)))
      throw new Error(`${prefix} history provider configuration is incomplete`);
    const chainId = Number(value("CHAIN_ID"));
    if (prefix === "WAYLEAVE_ARC_GRAPH" && chainId !== 5042002)
      throw new Error("Arc history provider requires chain 5042002");
    configs.push({ endpoint: value("ENDPOINT")!, deployment: value("DEPLOYMENT")!,
      chainId, startBlock: Number(value("START_BLOCK")), token: value("TOKEN")!, apiKey: value("API_KEY") });
  }
  return new HistoryService(configs);
}
