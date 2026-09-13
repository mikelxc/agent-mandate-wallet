import { createHash, randomUUID } from 'node:crypto';
import { getAddress, isAddress, isAddressEqual, zeroAddress, type Address } from 'viem';
import { arcCctpRoute, cctpIntentHash, parseCctpIntent } from '@mandate/sdk';
import { quoteAmounts, type Offering, type Purchase, type PurchaseQuote, type PurchaseDelivery } from 'wayleave-merchant';
import type { ArcChain } from './arc-chain';
import type { Store } from './store';
import { CctpStore } from './cctp';
import pack from './developer-pack.json';

type Buyer = { id: string; account: Address; owner: Address };
type SavedQuote = { quote: PurchaseQuote; agentId: string; owner: string; epoch: string; idempotencyKey: string };
type Acceptance = { quoteId: string; operationId: string | null; acceptedAt: number };
class MerchantError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export function developerOffering(recipient = process.env.WAYLEAVE_MERCHANT_RECIPIENT ?? ''): Offering {
  const valid = isAddress(recipient, { strict: false }) && recipient.toLowerCase() !== zeroAddress;
  const price = process.env.WAYLEAVE_PACK_PRICE_UNITS ?? '100000';
  const maxTransferFee = process.env.WAYLEAVE_PACK_MAX_FEE_UNITS ?? '1000';
  let priced = true;
  try { quoteAmounts(price, maxTransferFee); } catch { priced = false; }
  return { id: 'wayleave-developer-pack', version: pack.version, merchant: 'Wayleave', title: 'Wayleave Developer Pack', description: 'Architecture guide, validator source snapshot, deployment evidence and an example dataset. The public repository remains free.', price, maxTransferFee, currency: 'USDC', decimals: 6, testnet: true, sourceChainId: 5042002, destinationChainId: 11155111, token: arcCctpRoute.destinationToken, recipient: valid ? getAddress(recipient) : '', contentSha256: pack.sha256, files: pack.files.map(file => file.name), available: valid && priced };
}

/** Merchant storage and settlement adapter stay outside the portable merchant SDK. */
export class MerchantService {
  readonly operations: CctpStore;
  readonly ready: Promise<void>;
  constructor(readonly store: Store, readonly offering: Offering, readonly chain: Pick<ArcChain, 'ownership'> | undefined, readonly audience: string, readonly now = () => Math.floor(Date.now() / 1000)) {
    this.operations = new CctpStore(store);
    this.ready = this.initialize();
  }
  private async initialize() {
    await this.store.db.query('CREATE TABLE IF NOT EXISTS merchant_quotes (id TEXT PRIMARY KEY, agentId TEXT NOT NULL, owner TEXT NOT NULL, idempotencyKey TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(agentId,idempotencyKey))').run();
    await this.store.db.query('CREATE TABLE IF NOT EXISTS merchant_acceptances (quoteId TEXT PRIMARY KEY REFERENCES merchant_quotes(id), operationId TEXT UNIQUE, acceptedAt INTEGER NOT NULL)').run();
    await this.store.db.query('CREATE TABLE IF NOT EXISTS merchant_fulfillments (quoteId TEXT PRIMARY KEY REFERENCES merchant_quotes(id), settlementKey TEXT NOT NULL UNIQUE, bundleSha256 TEXT NOT NULL, createdAt INTEGER NOT NULL)').run();
  }
  async quote(buyer: Buyer, offeringId: string, idempotencyKey: string): Promise<PurchaseQuote> {
    await this.ready;
    if (!this.chain || !this.offering.available) throw new MerchantError('Merchant checkout is not configured', 503);
    if (offeringId !== this.offering.id) throw new MerchantError('Offering not found', 404);
    if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(idempotencyKey)) throw new MerchantError('Use an 8–128 character idempotency key', 400);
    const own = await this.chain.ownership(buyer.account);
    if (!isAddressEqual(own.owner as Address, buyer.owner)) throw new MerchantError('Arc account authority changed', 403);
    const q: PurchaseQuote = { version: 1, id: randomUUID(), offering: structuredClone(this.offering), createdAt: this.now(), expiresAt: this.now() + 900, account: getAddress(buyer.account), fundingOwner: getAddress(buyer.owner), ...quoteAmounts(this.offering.price, this.offering.maxTransferFee) };
    const saved: SavedQuote = { quote: q, owner: buyer.owner.toLowerCase(), agentId: buyer.id, epoch: own.epoch, idempotencyKey };
    await this.store.db.query('INSERT INTO merchant_quotes(id,agentId,owner,idempotencyKey,payload) VALUES(?,?,?,?,?) ON CONFLICT(agentId,idempotencyKey) DO NOTHING').run(q.id, buyer.id, saved.owner, idempotencyKey, JSON.stringify(saved));
    const row = await this.store.db.query('SELECT payload FROM merchant_quotes WHERE agentId=? AND idempotencyKey=?').get(buyer.id, idempotencyKey) as { payload: string };
    const existing: SavedQuote = JSON.parse(row.payload);
    if (existing.quote.offering.id !== offeringId || existing.owner !== saved.owner || !isAddressEqual(existing.quote.account as Address, buyer.account) || existing.epoch !== own.epoch) throw new MerchantError('Idempotency key belongs to a different purchase context');
    return existing.quote;
  }
  async readQuote(id: string, owner: string, agentId?: string): Promise<SavedQuote> {
    await this.ready;
    const row = await this.store.db.query('SELECT payload FROM merchant_quotes WHERE id=? AND owner=?').get(id, owner.toLowerCase()) as { payload: string } | null;
    const saved: SavedQuote | null = row ? JSON.parse(row.payload) : null;
    if (!saved || (agentId && agentId !== saved.agentId)) throw new MerchantError('Purchase not found', 404);
    return saved;
  }
  private intent(saved: SavedQuote) {
    const q = saved.quote;
    return parseCctpIntent({ version: 1, kind: 'cctp_payment', sourceChainId: 5042002, destinationChainId: 11155111, sourceDomain: 26, destinationDomain: 0, sourceToken: arcCctpRoute.sourceToken, destinationToken: q.offering.token, account: q.account, fundingOwner: q.fundingOwner, recipient: q.offering.recipient, amount: q.sourceDebit, maxFee: q.maximumTransferFee, amountSemantics: 'source_debit', minFinalityThreshold: 2000, businessReference: `Wayleave Developer Pack · ${q.id}`, idempotencyKey: `merchant:${q.id}` });
  }
  async requestPurchase(id: string, buyer: Buyer): Promise<Purchase> {
    const saved = await this.readQuote(id, buyer.owner, buyer.id);
    if (!this.chain) throw new MerchantError('Arc is not configured', 503);
    const own = await this.chain.ownership(buyer.account);
    if (!isAddressEqual(saved.quote.account as Address, buyer.account) || !isAddressEqual(own.owner as Address, buyer.owner) || own.epoch !== saved.epoch) throw new MerchantError('Purchase account authority changed', 403);
    // Persist acceptance first. Retries after expiry may resume this accepted purchase but cannot create another burn.
    await this.store.db.query('INSERT INTO merchant_acceptances(quoteId,operationId,acceptedAt) SELECT ?,NULL,? WHERE ? < ? ON CONFLICT(quoteId) DO NOTHING').run(id, this.now(), this.now(), saved.quote.expiresAt);
    const accepted = await this.store.db.query('SELECT * FROM merchant_acceptances WHERE quoteId=?').get(id) as Acceptance | null;
    if (!accepted) throw new MerchantError('Quote expired. Request a fresh quote with a new idempotency key.');
    if (!accepted.operationId) {
      const operation = await this.operations.create(saved.owner, this.intent(saved), accepted.acceptedAt, buyer.id);
      await this.store.db.query('UPDATE merchant_acceptances SET operationId=? WHERE quoteId=? AND operationId IS NULL').run(operation.id, id);
    }
    return this.purchase(id, saved.owner, buyer.id);
  }
  async purchase(id: string, owner: string, agentId?: string): Promise<Purchase> {
    const saved = await this.readQuote(id, owner, agentId);
    const acceptance = await this.store.db.query('SELECT * FROM merchant_acceptances WHERE quoteId=?').get(id) as Acceptance | null;
    if (!acceptance?.operationId) throw new MerchantError('Purchase request is not yet ready. Retry request_purchase.');
    const op = await this.operations.get(acceptance.operationId, saved.owner);
    if (!op || op.agentId !== saved.agentId || op.intentHash !== cctpIntentHash(this.intent(saved))) throw new MerchantError('Purchase payment binding does not match');
    const delivered = await this.store.db.query('SELECT bundleSha256 FROM merchant_fulfillments WHERE quoteId=?').get(id) as { bundleSha256: string } | null;
    const settled = op.status === 'settled' && !!op.source && !!op.destination;
    return { id, quote: saved.quote, operationId: op.id, approvalUrl: new URL(`/spending?request=${op.id}&purchase=${id}`, this.audience).href, paymentStatus: op.status, delivery: settled && delivered ? 'available' : 'locked', sourceTransactionHash: op.source?.transactionHash, destinationTransactionHash: op.destination?.transactionHash, merchantAmount: op.destination?.merchantAmount, ...(settled && delivered ? { bundleSha256: delivered.bundleSha256 } : {}) };
  }
  async delivery(id: string, owner: string, agentId?: string): Promise<PurchaseDelivery> {
    const purchase = await this.purchase(id, owner, agentId);
    const op = await this.operations.get(purchase.operationId, owner);
    if (!op || op.status !== 'settled' || !op.source || !op.destination || BigInt(op.destination.merchantAmount) < BigInt(purchase.quote.minimumMerchantReceipt) || BigInt(op.destination.merchantAmount) > BigInt(purchase.quote.maximumMerchantReceipt)) throw new MerchantError('Delivery is locked until the destination payment is verified', 402);
    // This adapter accepts only the gateway's verified CCTP receipts, never a browser-supplied hash or status.
    if (!/^0x[0-9a-fA-F]{64}$/.test(op.destination.nonce) || /^0x0{64}$/.test(op.destination.nonce)) throw new MerchantError('Invalid settlement evidence');
    if (purchase.quote.offering.id !== 'wayleave-developer-pack' || purchase.quote.offering.version !== pack.version || purchase.quote.offering.contentSha256 !== pack.sha256) throw new MerchantError('Purchased artifact version is unavailable', 503);
    const key = `${purchase.quote.offering.destinationChainId}:${op.destination.nonce.toLowerCase()}`;
    await this.store.db.query('INSERT INTO merchant_fulfillments(quoteId,settlementKey,bundleSha256,createdAt) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(id, key, pack.sha256, this.now());
    const row = await this.store.db.query('SELECT settlementKey,bundleSha256 FROM merchant_fulfillments WHERE quoteId=?').get(id) as { settlementKey: string; bundleSha256: string } | null;
    if (!row || row.settlementKey !== key || row.bundleSha256 !== pack.sha256) throw new MerchantError('Settlement already allocated or artifact version changed');
    return { purchaseId: id, offeringId: purchase.quote.offering.id, version: pack.version, sha256: pack.sha256, files: pack.files };
  }
  async list(owner: string) {
    await this.ready;
    const rows = await this.store.db.query('SELECT q.id FROM merchant_quotes q JOIN merchant_acceptances a ON a.quoteId=q.id WHERE q.owner=? AND a.operationId IS NOT NULL ORDER BY a.acceptedAt DESC LIMIT 50').all(owner.toLowerCase()) as { id: string }[];
    return Promise.all(rows.map(row => this.purchase(row.id, owner)));
  }
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new MerchantError('JSON required', 415);
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let count = 0;
  if (reader) while (true) { const part = await reader.read(); if (part.done) break; count += part.value.length; if (count > 4096) { await reader.cancel(); throw new MerchantError('Request too large', 413); } chunks.push(part.value); }
  const bytes = new Uint8Array(count); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let value: unknown; try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MerchantError('Invalid JSON', 400); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MerchantError('JSON object required', 400);
  return value as Record<string, unknown>;
}
export function createMerchantRoute(options: { store: Store; audience: string; chain?: Pick<ArcChain, 'ownership'>; offering?: Offering; authenticateAgent: (request: Request) => Promise<Buyer | null>; now?: () => number }) {
  const service = new MerchantService(options.store, options.offering ?? developerOffering(), options.chain, options.audience, options.now);
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/merchant/') && !path.startsWith('/agent/merchant/')) return null;
    try {
      if (path === '/merchant/offerings' && request.method === 'GET') return json({ offerings: [{ ...service.offering, available: service.offering.available && !!options.chain }] });
      const agentRoute = path.startsWith('/agent/');
      let owner: string; let buyer: Buyer | null = null;
      if (agentRoute) {
        buyer = await options.authenticateAgent(request);
        if (!buyer || !options.chain) throw new MerchantError('Use an enrolled agent with an associated Arc account and the required purchase permissions', 401);
        const own = await options.chain.ownership(buyer.account);
        if (!isAddressEqual(own.owner as Address, buyer.owner)) throw new MerchantError('Arc account authority changed', 403);
        owner = buyer.owner;
      } else {
        if (request.method !== 'GET') throw new MerchantError('Method not allowed', 405);
        const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)mandate_session=([a-f0-9]{64})(?:;|$)/)?.[1];
        const session = cookie && await options.store.session(sha(cookie), service.now());
        if (!session) throw new MerchantError('Sign in with your wallet', 401);
        owner = session;
      }
      if (!await options.store.takeRateLimit(`merchant:${buyer?.id ?? owner}`, service.now(), 60)) throw new MerchantError('Rate limit exceeded', 429);
      if (path === '/agent/merchant/quotes' && request.method === 'POST' && buyer) {
        const input = await body(request);
        if (Object.keys(input).some(k => !['offeringId', 'idempotencyKey'].includes(k)) || typeof input.offeringId !== 'string' || typeof input.idempotencyKey !== 'string') throw new MerchantError('Offering ID and idempotency key required', 400);
        return json(await service.quote(buyer, input.offeringId, input.idempotencyKey), 201);
      }
      const quoteMatch = path.match(/^\/agent\/merchant\/quotes\/([a-f0-9-]{36})\/purchase$/);
      if (quoteMatch && request.method === 'POST' && buyer) {
        if (Object.keys(await body(request)).length) throw new MerchantError('Purchase terms come from the saved quote', 400);
        return json(await service.requestPurchase(quoteMatch[1], buyer), 201);
      }
      if (path === '/merchant/purchases' && request.method === 'GET') return json({ purchases: await service.list(owner) });
      const match = path.match(/^\/(?:agent\/)?merchant\/purchases\/([a-f0-9-]{36})(\/delivery)?$/);
      if (match && request.method === 'GET') {
        const saved = await service.readQuote(match[1], owner, buyer?.id);
        if (buyer && !isAddressEqual(saved.quote.account as Address, buyer.account)) throw new MerchantError('Purchase not found', 404);
        return json(match[2] ? await service.delivery(match[1], owner, buyer?.id) : await service.purchase(match[1], owner, buyer?.id));
      }
      throw new MerchantError('Not found', 404);
    } catch (error) {
      return json({ error: error instanceof MerchantError ? error.message : 'Merchant request could not be completed. Retry the same request.' }, error instanceof MerchantError ? error.status : 409);
    }
  };
}
