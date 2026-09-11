import { createHash, randomUUID } from 'node:crypto';
import { cctpIntentHash, cctpMintCall, cctpPaymentSummary, parseCctpIntent, parseCctpMessage, type CctpIntent } from '@mandate/sdk';
import { isAddressEqual, type Address, type Hex } from 'viem';
import type { Store } from './store';
import type { Prepared } from './chain';
import type { ArcChain, CctpSourceReceipt, CctpDestinationReceipt } from './arc-chain';

export type CctpOperation = {
  id: string; agentId?: string; owner: string; intent: CctpIntent; intentHash: Hex; revision: number;
  status: 'approval_required' | 'approved' | 'attestation_pending' | 'destination_ready' | 'settled';
  createdAt: number; updatedAt: number; prepared?: Prepared; signature?: Hex;
  sourceTransactionHash?: Hex; destinationTransactionHash?: Hex;
  source?: CctpSourceReceipt; circle?: { message: Hex; attestation: Hex }; destination?: CctpDestinationReceipt;
  delivery: 'not_recorded';
  reconciliationError?: { phase: 'source' | 'destination'; code: 'receipt_not_verified'; at: number };
};
/** Independent durable table: source message survives session/agent revocation and restart. */
export class CctpStore {
  readonly ready: Promise<unknown>;
  constructor(readonly store: Store) {
    this.ready = store.db.query(`CREATE TABLE IF NOT EXISTS cctp_operations (id TEXT PRIMARY KEY, owner TEXT NOT NULL, idempotencyKey TEXT NOT NULL, intentHash TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, UNIQUE(owner,idempotencyKey))`).run();
  }
  async get(id: string, owner: string): Promise<CctpOperation | null> {
    await this.ready;
    const row = await this.store.db.query('SELECT payload FROM cctp_operations WHERE id=? AND owner=?').get(id, owner.toLowerCase()) as { payload: string } | null;
    return row ? JSON.parse(row.payload) : null;
  }
  async list(owner: string): Promise<CctpOperation[]> {
    await this.ready;
    const rows = await this.store.db.query('SELECT payload FROM cctp_operations WHERE owner=? ORDER BY rowid DESC LIMIT 100').all(owner.toLowerCase()) as { payload: string }[];
    return rows.map(row => JSON.parse(row.payload));
  }
  async create(owner: string, intent: CctpIntent, now: number, agentId?: string): Promise<CctpOperation> {
    await this.ready;
    const i = parseCctpIntent(intent), hash = cctpIntentHash(i);
    const operation: CctpOperation = { id: randomUUID(), agentId, owner: owner.toLowerCase(), intent: i, intentHash: hash, revision: 0, status: 'approval_required', delivery: 'not_recorded', createdAt: now, updatedAt: now };
    await this.store.db.query('INSERT INTO cctp_operations(id,owner,idempotencyKey,intentHash,revision,payload) VALUES(?,?,?,?,0,?) ON CONFLICT(owner,idempotencyKey) DO NOTHING').run(operation.id, operation.owner, i.idempotencyKey, hash, JSON.stringify(operation));
    const row = await this.store.db.query('SELECT intentHash,payload FROM cctp_operations WHERE owner=? AND idempotencyKey=?').get(operation.owner, i.idempotencyKey) as { intentHash: string; payload: string };
    if (row.intentHash !== hash) throw new Error('Idempotency key already used for different terms');
    const saved: CctpOperation = JSON.parse(row.payload);
    if (agentId && saved.agentId !== agentId) throw new Error('Idempotency key already used by another connection');
    return saved;
  }
  async save(previous: CctpOperation, changes: Partial<Pick<CctpOperation, 'prepared' | 'signature' | 'source' | 'circle' | 'destination' | 'status' | 'sourceTransactionHash' | 'destinationTransactionHash' | 'reconciliationError'>>, now: number) {
    const next = { ...previous, ...changes, revision: previous.revision + 1, updatedAt: now };
    const result = await this.store.db.query('UPDATE cctp_operations SET revision=?,payload=? WHERE id=? AND owner=? AND revision=?').run(next.revision, JSON.stringify(next), previous.id, previous.owner, previous.revision);
    if (result.changes !== 1) throw new Error('Operation changed; reload before retrying');
    return next;
  }
}
export class CircleAttestations {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async get(operation: CctpOperation) {
    if (!operation.source) throw new Error('Source receipt required');
    const response = await this.fetcher(`https://iris-api-sandbox.circle.com/v2/messages/26?transactionHash=${operation.source.transactionHash}`, { signal: AbortSignal.timeout(15_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Circle attestation service unavailable');
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error('Circle response too large');
    const data = JSON.parse(text) as { messages?: { status?: string; message?: string; attestation?: string }[] };
    if (!Array.isArray(data.messages)) throw new Error('Invalid Circle response');
    const matches = data.messages.filter(row => {
      if (row.status !== 'complete' || typeof row.message !== 'string' || typeof row.attestation !== 'string') return false;
      try { return parseCctpMessage(row.message as Hex, operation.intent, true).fingerprint === operation.source!.fingerprint; } catch { return false; }
    });
    if (!matches.length) return null;
    if (matches.length !== 1) throw new Error('Ambiguous Circle attestation');
    const circle = { message: matches[0].message as Hex, attestation: matches[0].attestation as Hex };
    cctpMintCall(circle.message, circle.attestation, operation.intent);
    return circle;
  }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function hex(value: unknown, bytes?: number): Hex {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value) || (bytes && value.length !== 2 + bytes * 2) || value.length > 8194) throw new Error('Invalid hexadecimal value');
  return value as Hex;
}
/** Mount through createApp.routes so its host/origin checks precede cookie authentication. */
export function createCctpRoute(options: { store: Store; audience: string; authenticateAgent?: (request: Request) => Promise<{ id: string; account: Address; owner: Address } | null>; chain?: ArcChain; circle?: CircleAttestations; now?: () => number; deployment?: { entryPoint: Address } }) {
  const { store, chain } = options, operations = new CctpStore(store), circle = options.circle ?? new CircleAttestations(), now = options.now ?? (() => Math.floor(Date.now() / 1000));
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (path === '/agent/crosschain' || path.startsWith('/agent/crosschain/')) {
      if (!chain || !options.authenticateAgent) return json({ error: 'Arc agent identity is not configured' }, 503);
      try {
        const agent = await options.authenticateAgent(request);
        if (!agent) return json({ error: 'Arc-scoped agent identity required' }, 401);
        if (!await store.takeRateLimit(`cctp-agent:${agent.id}`, now(), 60)) return json({ error: 'Rate limit exceeded' }, 429);
        const own = await chain.ownership(agent.account);
        if (!isAddressEqual(own.owner as Address, agent.owner)) return json({ error: 'Arc account authority changed' }, 403);
        const publicOperation = (op: CctpOperation) => ({ id: op.id, intent: op.intent, status: op.status, source: op.source, destination: op.destination, delivery: op.delivery, createdAt: op.createdAt, updatedAt: op.updatedAt });
        if (request.method === 'POST' && path === '/agent/crosschain') {
          if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json({ error: 'JSON required' }, 415);
          const reader = request.body?.getReader(); let input = '', size = 0; const decoder = new TextDecoder();
          if (reader) while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 16384) { await reader.cancel(); return json({ error: 'Request too large' }, 413); } input += decoder.decode(part.value, { stream: true }); }
          input += decoder.decode();
          const i = parseCctpIntent(JSON.parse(input).intent);
          if (!isAddressEqual(i.account, agent.account) || !isAddressEqual(i.fundingOwner, agent.owner)) return json({ error: 'Account outside agent scope' }, 403);
          return json(publicOperation(await operations.create(agent.owner, i, now(), agent.id)), 201);
        }
        const match = path.match(/^\/agent\/crosschain\/([a-f0-9-]{36})$/);
        if (request.method === 'GET' && match) {
          const op = await operations.get(match[1], agent.owner);
          if (!op || op.agentId !== agent.id || !isAddressEqual(op.intent.account, agent.account)) return json({ error: 'Not found' }, 404);
          return json(publicOperation(op));
        }
        return json({ error: 'Not found' }, 404);
      } catch { return json({ error: 'Cross-chain agent request could not be completed' }, 409); }
    }
    if (path !== '/crosschain' && !path.startsWith('/crosschain/')) return null;
    if (path === '/crosschain/config' && request.method === 'GET') return json({ configured: !!chain, chainId: 5042002, destinationChainId: 84532, entryPoint: options.deployment?.entryPoint, nativeDecimals: 18, tokenDecimals: 6 });
    if (request.method !== 'GET' && request.headers.get('origin') !== new URL(options.audience).origin) return json({ error: 'Dashboard origin required' }, 403);
    const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)mandate_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    const owner = cookie && await store.session(digest(cookie), now());
    if (!owner) return json({ error: 'Sign in with your wallet' }, 401);
    if (!await store.takeRateLimit(`cctp:${owner}`, now(), 60)) return json({ error: 'Rate limit exceeded' }, 429);
    try {
      if (path === '/crosschain' && request.method === 'GET') return json({ operations: await operations.list(owner), available: !!chain, mode: 'owner_approved_testnet', route: 'Arc Testnet → Base Sepolia' });
      if (!chain) return json({ error: 'Arc deployment is not configured', code: 'arc_not_configured' }, 503);
      let body: Record<string, unknown> = {};
      if (request.method === 'POST') {
        if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json({ error: 'JSON required' }, 415);
        // Streaming cap also covers requests without Content-Length.
        const reader = request.body?.getReader(); let text = '', count = 0;
        if (reader) { const decoder = new TextDecoder(); while (true) { const part = await reader.read(); if (part.done) break; count += part.value.byteLength; if (count > 16_384) { await reader.cancel(); return json({ error: 'Request too large' }, 413); } text += decoder.decode(part.value, { stream: true }); } text += decoder.decode(); }
        body = JSON.parse(text || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('JSON object required');
      }
      if (path === '/crosschain' && request.method === 'POST') {
        const intent = parseCctpIntent(body.intent);
        const own = await chain.ownership(intent.account);
        if (!isAddressEqual(owner as Address, intent.fundingOwner) || !isAddressEqual(own.owner as Address, owner as Address)) return json({ error: 'Arc account owner required' }, 403);
        return json(await operations.create(owner, intent, now()), 201);
      }
      const match = path.match(/^\/crosschain\/([a-f0-9-]{36})(?:\/(prepare|approve|source|attestation|destination))?$/);
      if (!match) return json({ error: 'Not found' }, 404);
      const operation = await operations.get(match[1], owner);
      if (!operation) return json({ error: 'Not found' }, 404);
      if (request.method === 'GET' && !match[2]) return json(operation);
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      switch (match[2]) {
        case 'prepare': {
          if (operation.prepared) return json({ operation, prepared: operation.prepared, summary: cctpPaymentSummary(operation.intent) });
          if (operation.status !== 'approval_required') throw new Error('Operation cannot be prepared');
          const prepared = await chain.prepare(operation.intent);
          return json({ operation: await operations.save(operation, { prepared }, now()), prepared, summary: cctpPaymentSummary(operation.intent) });
        }
        case 'approve': {
          if (operation.status !== 'approval_required' || !operation.prepared) throw new Error('Prepare payment before approval');
          const signature = hex(body.signature);
          if (!await chain.verifyApproval(operation.intent, operation.prepared, signature)) return json({ error: 'Invalid owner approval' }, 403);
          return json(await operations.save(operation, { status: 'approved', signature }, now()));
        }
        case 'source': {
          if (operation.source) { if (operation.source.transactionHash !== hex(body.transactionHash, 32)) throw new Error('Source already recorded'); return json(operation); }
          if (operation.status !== 'approved' || !operation.prepared) throw new Error('Owner approval required');
          const transactionHash = hex(body.transactionHash, 32);
          if (operation.sourceTransactionHash && operation.sourceTransactionHash !== transactionHash) throw new Error('Source already submitted; reconcile existing transaction');
          const pending = operation.sourceTransactionHash ? operation : await operations.save(operation, { sourceTransactionHash: transactionHash }, now());
          try {
            const source = await chain.sourceReceipt(operation.intent, operation.prepared, transactionHash);
            return json(await operations.save(pending, { source, status: 'attestation_pending', reconciliationError: undefined }, now()));
          } catch (error) {
            await operations.save(pending, { reconciliationError: { phase: 'source', code: 'receipt_not_verified', at: now() } }, now());
            throw error;
          }
        }
        case 'attestation': {
          if (operation.status === 'settled') return json(operation);
          if (!operation.source) throw new Error('Verified source required');
          const attestation = await circle.get(operation);
          if (!attestation) return json({ operation, pending: true }, 202);
          const updated = await operations.save(operation, { circle: attestation, status: 'destination_ready' }, now());
          return json({ operation: updated, mint: cctpMintCall(attestation.message, attestation.attestation, operation.intent) });
        }
        case 'destination': {
          if (operation.destination) return json(operation);
          if (!operation.circle) throw new Error('Circle attestation required');
          const transactionHash = hex(body.transactionHash, 32);
          // Failed destination submissions may retry the same attested message; CCTP nonce prevents a second mint.
          const pending = await operations.save(operation, { destinationTransactionHash: transactionHash }, now());
          try {
            const destination = await chain.destinationReceipt(operation.intent, operation.circle.message, transactionHash);
            return json(await operations.save(pending, { destination, status: 'settled', reconciliationError: undefined }, now()));
          } catch (error) {
            await operations.save(pending, { reconciliationError: { phase: 'destination', code: 'receipt_not_verified', at: now() } }, now());
            throw error;
          }
        }
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      // Never expose RPC credentials, URLs, account signatures or upstream response bodies.
      const message = error instanceof Error ? error.message : '';
      const safe = /^(Invalid |Unsupported |Unknown |Maximum fee|Reference |Idempotency |Operation |Prepare |Owner approval|Source already|Verified source|Circle attestation required|Arc funding|Fund |Arc gas|External EOA|Matching successful|Inner source|Destination |Direct Circle|CCTP message)/.test(message) && message.length < 180;
      return json({ error: safe ? message : 'Cross-chain request could not be completed. Check configuration or retry reconciliation.' }, 409);
    }
  };
}
