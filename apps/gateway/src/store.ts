import { createClient, type Client } from "@libsql/client";
import { SqlDatabase } from "./database";
const schema = [
  `CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, message TEXT NOT NULL, address TEXT NOT NULL, expiresAt INTEGER NOT NULL, usedAt INTEGER)`,
  `CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, address TEXT NOT NULL, expiresAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS passkeys (account TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, credentialId TEXT NOT NULL UNIQUE, x TEXT NOT NULL, y TEXT NOT NULL, origin TEXT NOT NULL, rpId TEXT NOT NULL, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS passkey_challenges (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('registration','login')), account TEXT, label TEXT, credentialId TEXT, challenge TEXT NOT NULL, expiresAt INTEGER NOT NULL, usedAt INTEGER)`,
  `CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, account TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE, expiresAt INTEGER NOT NULL, revokedAt INTEGER, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, agentId TEXT NOT NULL REFERENCES agents(id), owner TEXT NOT NULL, intent TEXT NOT NULL, intentHash TEXT NOT NULL, idempotencyKey TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('approval_required','rejected','approved')), createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, decisionReason TEXT, UNIQUE(agentId, idempotencyKey))`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, operationId TEXT REFERENCES operations(id), agentId TEXT REFERENCES agents(id), owner TEXT, event TEXT NOT NULL, details TEXT, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS prepared_operations (operationId TEXT PRIMARY KEY REFERENCES operations(id) ON DELETE CASCADE, payload TEXT NOT NULL, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS signatures (opId TEXT PRIMARY KEY REFERENCES operations(id) ON DELETE CASCADE, signature TEXT NOT NULL, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS execution_receipts (operationId TEXT PRIMARY KEY REFERENCES operations(id) ON DELETE CASCADE, transactionHash TEXT NOT NULL, userOpHash TEXT NOT NULL, success INTEGER NOT NULL CHECK(success IN (0,1)), blockNumber TEXT NOT NULL, createdAt INTEGER NOT NULL)`,
  "CREATE INDEX IF NOT EXISTS operations_owner_idx ON operations(owner, createdAt)",
  "CREATE INDEX IF NOT EXISTS agents_owner_idx ON agents(owner, createdAt)",
  "CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expiresAt INTEGER NOT NULL)",
];
export type Challenge = {
  id: string;
  message: string;
  address: string;
  expiresAt: number;
  usedAt: number | null;
};
export type Session = {
  hash: string;
  address: string;
  expiresAt: number;
};
export type Passkey = {
  account: string;
  label: string;
  credentialId: string;
  x: string;
  y: string;
  origin: string;
  rpId: string;
  createdAt: number;
};
export type PasskeyChallenge = {
  id: string;
  kind: "registration" | "login";
  account: string | null;
  label: string | null;
  credentialId: string | null;
  challenge: string;
  expiresAt: number;
  usedAt: number | null;
};
export type Agent = {
  id: string;
  name: string;
  owner: string;
  account: string;
  expiresAt: number;
  revokedAt: number | null;
  createdAt: number;
};
export type OperationStatus = "approval_required" | "rejected" | "approved";
export type Operation = {
  id: string;
  agentId: string;
  owner: string;
  intent: any;
  intentHash: string;
  idempotencyKey: string;
  status: OperationStatus;
  createdAt: number;
  updatedAt: number;
  decisionReason: string | null;
  execution?: ExecutionReceipt;
};
export type ExecutionReceipt = {
  transactionHash: string;
  userOpHash: string;
  success: boolean;
  blockNumber: string;
};
export type AuditEvent = {
  id: string;
  operationId: string | null;
  agentId: string | null;
  owner: string | null;
  event: string;
  details: any;
  createdAt: number;
};
export class Store {
  readonly db: SqlDatabase;
  constructor(path: string | Client) {
    this.db = new SqlDatabase(
      typeof path === "string"
        ? createClient({ url: path === ":memory:" ? "file::memory:" : "file:" + path })
        : path,
      schema,
    );
  }
  close() {
    this.db.close();
  }
  async takeRateLimit(key: string, now: number, maximum = 120): Promise<boolean> {
    await this.db.query("DELETE FROM rate_limits WHERE expiresAt<=?").run(now);
    const row = (await this.db
      .query(`INSERT INTO rate_limits(key,count,expiresAt) VALUES(?,1,?)
          ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`)
      .get(key, now + 60)) as { count: number };
    return row.count <= maximum;
  }
  private transaction<T>(callback: (store: Store) => Promise<T>): Promise<T> {
    return this.db.transaction(async (db) => {
      const scoped = Object.create(this) as Store;
      Object.defineProperty(scoped, "db", { value: db });
      return callback(scoped);
    });
  }
  async createChallenge(
    row: Omit<Challenge, "usedAt"> & {
      usedAt?: number | null;
    },
  ): Promise<Challenge> {
    await this.db
      .query("INSERT INTO challenges (id,message,address,expiresAt,usedAt) VALUES (?,?,?,?,?)")
      .run(row.id, row.message, row.address, row.expiresAt, row.usedAt ?? null);
    return (await this.getChallenge(row.id))!;
  }
  async getChallenge(id: string): Promise<Challenge | null> {
    return (
      ((await this.db.query("SELECT * FROM challenges WHERE id=?").get(id)) as Challenge | null) ??
      null
    );
  }
  async consumeChallenge(id: string, now: number): Promise<Challenge | null> {
    const tx = this.transaction(async (store) => {
      const row = await store.getChallenge(id);
      if (!row || row.usedAt !== null || row.expiresAt <= now) return null;
      await store.db
        .query("UPDATE challenges SET usedAt=? WHERE id=? AND usedAt IS NULL AND expiresAt>?")
        .run(now, id, now);
      return await store.getChallenge(id);
    });
    return (await tx) as Challenge | null;
  }
  async createSession(hash: string, address: string, expiresAt: number): Promise<Session> {
    await this.db
      .query("INSERT INTO sessions(hash,address,expiresAt) VALUES(?,?,?)")
      .run(hash, address, expiresAt);
    return { hash, address, expiresAt };
  }
  async session(hash: string, now: number): Promise<string | null> {
    const r = (await this.db
      .query("SELECT address FROM sessions WHERE hash=? AND expiresAt>?")
      .get(hash, now)) as {
      address: string;
    } | null;
    return r?.address ?? null;
  }
  async deleteSession(hash: string): Promise<boolean> {
    return (await this.db.query("DELETE FROM sessions WHERE hash=?").run(hash)).changes > 0;
  }
  async createPasskeyChallenge(
    row: Omit<PasskeyChallenge, "usedAt"> & {
      usedAt?: number | null;
    },
  ): Promise<PasskeyChallenge> {
    await this.db
      .query(
        "INSERT INTO passkey_challenges(id,kind,account,label,credentialId,challenge,expiresAt,usedAt) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        row.id,
        row.kind,
        row.account,
        row.label,
        row.credentialId,
        row.challenge,
        row.expiresAt,
        row.usedAt ?? null,
      );
    return (await this.getPasskeyChallenge(row.id))!;
  }
  async getPasskeyChallenge(id: string): Promise<PasskeyChallenge | null> {
    return (
      ((await this.db
        .query("SELECT * FROM passkey_challenges WHERE id=?")
        .get(id)) as PasskeyChallenge | null) ?? null
    );
  }
  async consumePasskeyChallenge(id: string, now: number): Promise<PasskeyChallenge | null> {
    const tx = this.transaction(async (store) => {
      const row = await store.getPasskeyChallenge(id);
      if (!row || row.usedAt !== null || row.expiresAt <= now) return null;
      await store.db
        .query(
          "UPDATE passkey_challenges SET usedAt=? WHERE id=? AND usedAt IS NULL AND expiresAt>?",
        )
        .run(now, id, now);
      return await store.getPasskeyChallenge(id);
    });
    return (await tx) as PasskeyChallenge | null;
  }
  async createPasskey(row: Passkey): Promise<Passkey> {
    await this.db
      .query(
        "INSERT INTO passkeys(account,label,credentialId,x,y,origin,rpId,createdAt) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        row.account,
        row.label,
        row.credentialId,
        row.x,
        row.y,
        row.origin,
        row.rpId,
        row.createdAt,
      );
    return row;
  }
  async passkeyByAccount(account: string): Promise<Passkey | null> {
    return (
      ((await this.db
        .query("SELECT * FROM passkeys WHERE account=?")
        .get(account.toLowerCase())) as Passkey | null) ?? null
    );
  }
  async passkeyByCredential(credentialId: string): Promise<Passkey | null> {
    return (
      ((await this.db
        .query("SELECT * FROM passkeys WHERE credentialId=?")
        .get(credentialId)) as Passkey | null) ?? null
    );
  }
  async passkeyLabel(label: string): Promise<Passkey | null> {
    return (
      ((await this.db
        .query("SELECT * FROM passkeys WHERE label=?")
        .get(label)) as Passkey | null) ?? null
    );
  }
  async createAgent(
    input: {
      name: string;
      owner: string;
      account: string;
      tokenHash: string;
      expiresAt: number;
    },
    now: number,
  ): Promise<Agent> {
    const id = crypto.randomUUID();
    await this.db
      .query(
        "INSERT INTO agents(id,name,owner,account,tokenHash,expiresAt,revokedAt,createdAt) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(id, input.name, input.owner, input.account, input.tokenHash, input.expiresAt, null, now);
    return (await this.agentById(id))!;
  }
  private async agentById(id: string): Promise<Agent | null> {
    return (
      ((await this.db
        .query("SELECT id,name,owner,account,expiresAt,revokedAt,createdAt FROM agents WHERE id=?")
        .get(id)) as Agent | null) ?? null
    );
  }
  async authenticateAgent(tokenHash: string, now: number): Promise<Agent | null> {
    return (
      ((await this.db
        .query(
          "SELECT id,name,owner,account,expiresAt,revokedAt,createdAt FROM agents WHERE tokenHash=? AND revokedAt IS NULL AND expiresAt>? ",
        )
        .get(tokenHash, now)) as Agent | null) ?? null
    );
  }
  async listAgents(owner: string): Promise<Agent[]> {
    return (await this.db
      .query(
        "SELECT id,name,owner,account,expiresAt,revokedAt,createdAt FROM agents WHERE owner=? ORDER BY createdAt",
      )
      .all(owner)) as Agent[];
  }
  async revokeAgent(id: string, owner: string, now: number): Promise<boolean> {
    const r = await this.db
      .query("UPDATE agents SET revokedAt=? WHERE id=? AND owner=? AND revokedAt IS NULL")
      .run(now, id, owner);
    return r.changes > 0;
  }
  propose(agent: Agent, intent: any, intentHash: string, now: number): Promise<Operation>;
  propose(
    agent: Agent,
    intent: any,
    intentHash: string,
    idempotencyKey: string,
    now: number,
  ): Promise<Operation>;
  async propose(
    agent: Agent,
    intent: any,
    intentHash: string,
    keyOrNow: string | number,
    maybeNow?: number,
  ): Promise<Operation> {
    const idempotencyKey = typeof keyOrNow === "number" ? intent?.idempotencyKey : keyOrNow;
    const now = typeof keyOrNow === "number" ? keyOrNow : maybeNow!;
    if (typeof idempotencyKey !== "string" || !idempotencyKey)
      throw new Error("idempotency key required");
    const tx = this.transaction(async (store) => {
      const existing = (await store.db
        .query("SELECT * FROM operations WHERE agentId=? AND idempotencyKey=?")
        .get(agent.id, idempotencyKey)) as any;
      if (existing) {
        if (existing.intentHash !== intentHash) throw new Error("idempotency key conflict");
        return await store.decodeOperation(existing);
      }
      const id = crypto.randomUUID();
      await store.db
        .query(
          "INSERT INTO operations(id,agentId,owner,intent,intentHash,idempotencyKey,status,createdAt,updatedAt,decisionReason) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          agent.id,
          agent.owner,
          JSON.stringify(intent),
          intentHash,
          idempotencyKey,
          "approval_required",
          now,
          now,
          null,
        );
      return await store.decodeOperation(
        (await store.db.query("SELECT * FROM operations WHERE id=?").get(id)) as any,
      );
    });
    return (await tx) as Operation;
  }
  private async decodeOperation(row: any): Promise<Operation> {
    const operation = { ...row, intent: JSON.parse(row.intent) } as Operation;
    const receipt = (await this.db
      .query(
        "SELECT transactionHash,userOpHash,success,blockNumber FROM execution_receipts WHERE operationId=?",
      )
      .get(row.id)) as any;
    if (receipt) operation.execution = { ...receipt, success: Boolean(receipt.success) };
    return operation;
  }
  async listOperations(owner: string): Promise<Operation[]> {
    const rows = await this.db
      .query("SELECT * FROM operations WHERE owner=? ORDER BY createdAt")
      .all(owner);
    return Promise.all(rows.map((r) => this.decodeOperation(r)));
  }
  async operationForAgent(id: string, agentId: string): Promise<Operation | null> {
    const r = (await this.db
      .query("SELECT * FROM operations WHERE id=? AND agentId=?")
      .get(id, agentId)) as any;
    return r ? await this.decodeOperation(r) : null;
  }
  async operationForOwner(id: string, owner: string): Promise<Operation | null> {
    const r = (await this.db
      .query("SELECT * FROM operations WHERE id=? AND owner=?")
      .get(id, owner)) as any;
    return r ? await this.decodeOperation(r) : null;
  }
  async recordExecution(
    id: string,
    owner: string,
    receipt: ExecutionReceipt,
    now: number,
  ): Promise<Operation> {
    const tx = this.transaction(async (store) => {
      const row = (await store.db
        .query("SELECT * FROM operations WHERE id=? AND owner=?")
        .get(id, owner)) as any;
      if (!row) throw new Error("operation not found");
      if (row.status !== "approved") throw new Error("operation not approved");
      const existing = (await store.db
        .query("SELECT transactionHash FROM execution_receipts WHERE operationId=?")
        .get(id)) as {
        transactionHash: string;
      } | null;
      if (existing && existing.transactionHash !== receipt.transactionHash)
        throw new Error("Execution receipt conflict");
      await store.db
        .query(
          "INSERT INTO execution_receipts(operationId,transactionHash,userOpHash,success,blockNumber,createdAt) VALUES(?,?,?,?,?,?) ON CONFLICT(operationId) DO UPDATE SET transactionHash=excluded.transactionHash,userOpHash=excluded.userOpHash,success=excluded.success,blockNumber=excluded.blockNumber,createdAt=excluded.createdAt",
        )
        .run(
          id,
          receipt.transactionHash,
          receipt.userOpHash,
          receipt.success ? 1 : 0,
          receipt.blockNumber,
          now,
        );
      return await store.decodeOperation(
        (await store.db.query("SELECT * FROM operations WHERE id=?").get(id)) as any,
      );
    });
    return (await tx) as Operation;
  }
  async setPrepared(id: string, owner: string, payload: any, now: number): Promise<boolean> {
    return this.transaction((store) => store.setPreparedInTransaction(id, owner, payload, now));
  }
  private async setPreparedInTransaction(
    id: string,
    owner: string,
    payload: any,
    now: number,
  ): Promise<boolean> {
    const row = (await this.db
      .query("SELECT intent,status FROM operations WHERE id=? AND owner=?")
      .get(id, owner)) as any;
    if (!row || row.status !== "approval_required") throw new Error("operation not pending");
    if (this.intentExpired(row.intent, now)) throw new Error("intent expired");
    const busy = await this.db
      .query(`SELECT o.id FROM operations o JOIN prepared_operations p ON p.operationId=o.id
      LEFT JOIN execution_receipts e ON e.operationId=o.id
      WHERE o.id<>? AND json_extract(o.intent,'$.account')=? AND e.operationId IS NULL
      AND (o.status='approved' OR (o.status='approval_required' AND json_extract(o.intent,'$.expiresAt')>? AND json_extract(p.payload,'$.preparedUntil')>?)) LIMIT 1`)
      .get(id, JSON.parse(row.intent).account ?? null, now, now);
    if (busy)
      throw new Error(
        "Account has another prepared or signed payment; resolve it first (nonce conflict)",
      );
    const existing = await this.getPrepared(id, owner);
    if (existing?.preparedUntil > now && existing.actionHash !== payload.actionHash)
      throw new Error("Prepared payment conflict");
    await this.db
      .query(
        "INSERT INTO prepared_operations(operationId,payload,createdAt) VALUES(?,?,?) ON CONFLICT(operationId) DO UPDATE SET payload=excluded.payload,createdAt=excluded.createdAt",
      )
      .run(id, JSON.stringify(payload), now);
    return true;
  }
  async getPrepared(id: string, owner: string): Promise<any | null> {
    const allowed = await this.db
      .query("SELECT 1 FROM operations WHERE id=? AND owner=?")
      .get(id, owner);
    if (!allowed) return null;
    const row = (await this.db
      .query("SELECT payload FROM prepared_operations WHERE operationId=?")
      .get(id)) as {
      payload: string;
    } | null;
    return row ? JSON.parse(row.payload) : null;
  }
  private intentExpired(raw: string, now: number): boolean {
    const intent = JSON.parse(raw);
    return typeof intent?.expiresAt === "number" && intent.expiresAt <= now;
  }
  async recordApproval(
    id: string,
    owner: string,
    signature: string,
    now: number,
  ): Promise<Operation> {
    const tx = this.transaction(async (store) => {
      const row = (await store.db
        .query("SELECT * FROM operations WHERE id=? AND owner=?")
        .get(id, owner)) as any;
      if (!row) throw new Error("operation not found");
      const prior = (await store.db
        .query("SELECT signature FROM signatures WHERE opId=?")
        .get(id)) as {
        signature: string;
      } | null;
      if (row.status === "approved" && prior?.signature === signature)
        return await store.decodeOperation(row);
      if (row.status !== "approval_required") throw new Error("decision conflict");
      if (store.intentExpired(row.intent, now)) {
        await store.db
          .query(
            "UPDATE operations SET status='rejected',updatedAt=?,decisionReason='intent expired' WHERE id=?",
          )
          .run(now, id);
        return {
          expired: true,
          operation: await store.decodeOperation(
            (await store.db.query("SELECT * FROM operations WHERE id=?").get(id)) as any,
          ),
        };
      }
      const prepared = await store.db
        .query("SELECT 1 FROM prepared_operations WHERE operationId=?")
        .get(id);
      if (!prepared) throw new Error("operation not prepared");
      await store.db
        .query(
          "UPDATE operations SET status='approved',updatedAt=?,decisionReason=NULL WHERE id=? AND status='approval_required'",
        )
        .run(now, id);
      await store.db
        .query("INSERT INTO signatures(opId,signature,createdAt) VALUES(?,?,?)")
        .run(id, signature, now);
      return await store.decodeOperation(
        (await store.db.query("SELECT * FROM operations WHERE id=?").get(id)) as any,
      );
    });
    const result = (await tx) as
      | Operation
      | {
          expired: true;
          operation: Operation;
        };
    if ("expired" in result) throw new Error("intent expired");
    return result;
  }
  async decide(
    id: string,
    owner: string,
    decision: "approved" | "rejected",
    reason: string | null,
    now: number,
  ): Promise<Operation> {
    return this.transaction((store) => store.decideInTransaction(id, owner, decision, reason, now));
  }
  private async decideInTransaction(
    id: string,
    owner: string,
    decision: "approved" | "rejected",
    reason: string | null,
    now: number,
  ): Promise<Operation> {
    const row = (await this.db
      .query("SELECT * FROM operations WHERE id=? AND owner=?")
      .get(id, owner)) as any;
    if (!row) throw new Error("operation not found");
    if (row.status !== "approval_required") {
      if (row.status === decision) return await this.decodeOperation(row);
      throw new Error("decision conflict");
    }
    if (row.createdAt > now) throw new Error("invalid time");
    if (decision === "approved" && this.intentExpired(row.intent, now)) {
      decision = "rejected";
      reason = reason ?? "intent expired";
    }
    await this.db
      .query(
        "UPDATE operations SET status=?,updatedAt=?,decisionReason=? WHERE id=? AND status='approval_required'",
      )
      .run(decision, now, reason, id);
    return await this.decodeOperation(
      (await this.db.query("SELECT * FROM operations WHERE id=?").get(id)) as any,
    );
  }
  async audit(event: Omit<AuditEvent, "id">): Promise<AuditEvent> {
    const id = crypto.randomUUID();
    await this.db
      .query(
        "INSERT INTO audit_events(id,operationId,agentId,owner,event,details,createdAt) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        id,
        event.operationId,
        event.agentId,
        event.owner,
        event.event,
        event.details == null ? null : JSON.stringify(event.details),
        event.createdAt,
      );
    return { ...event, id };
  }
  async listAudit(owner: string): Promise<AuditEvent[]> {
    return (
      (await this.db
        .query("SELECT * FROM audit_events WHERE owner=? ORDER BY createdAt")
        .all(owner)) as any[]
    ).map((r) => ({ ...r, details: r.details == null ? null : JSON.parse(r.details) }));
  }
}
