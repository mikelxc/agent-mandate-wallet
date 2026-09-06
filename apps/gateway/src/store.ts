import { Database } from "bun:sqlite";

export type Challenge = {
  id: string;
  message: string;
  address: string;
  expiresAt: number;
  usedAt: number | null;
};
export type Session = { hash: string; address: string; expiresAt: number };
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
  readonly db: Database;
  constructor(path: string) {
    this.db = new Database(path);
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
    this.db.run(
      `CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, message TEXT NOT NULL, address TEXT NOT NULL, expiresAt INTEGER NOT NULL, usedAt INTEGER)`,
    );
    this.db.run(
      `CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, address TEXT NOT NULL, expiresAt INTEGER NOT NULL)`,
    );
    this.db.run(
      `CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, account TEXT NOT NULL, tokenHash TEXT NOT NULL UNIQUE, expiresAt INTEGER NOT NULL, revokedAt INTEGER, createdAt INTEGER NOT NULL)`,
    );
    this.db.run(
      `CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, agentId TEXT NOT NULL REFERENCES agents(id), owner TEXT NOT NULL, intent TEXT NOT NULL, intentHash TEXT NOT NULL, idempotencyKey TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('approval_required','rejected','approved')), createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, decisionReason TEXT, UNIQUE(agentId, idempotencyKey))`,
    );
    this.db.run(
      `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, operationId TEXT REFERENCES operations(id), agentId TEXT REFERENCES agents(id), owner TEXT, event TEXT NOT NULL, details TEXT, createdAt INTEGER NOT NULL)`,
    );
    this.db.run(
      `CREATE TABLE IF NOT EXISTS prepared_operations (operationId TEXT PRIMARY KEY REFERENCES operations(id) ON DELETE CASCADE, payload TEXT NOT NULL, createdAt INTEGER NOT NULL)`,
    );
    this.db.run(
      `CREATE TABLE IF NOT EXISTS signatures (opId TEXT PRIMARY KEY REFERENCES operations(id) ON DELETE CASCADE, signature TEXT NOT NULL, createdAt INTEGER NOT NULL)`,
    );
    this.db.run(
      `CREATE TABLE IF NOT EXISTS execution_receipts (operationId TEXT PRIMARY KEY REFERENCES operations(id) ON DELETE CASCADE, transactionHash TEXT NOT NULL, userOpHash TEXT NOT NULL, success INTEGER NOT NULL CHECK(success IN (0,1)), blockNumber TEXT NOT NULL, createdAt INTEGER NOT NULL)`,
    );
    this.db.run("CREATE INDEX IF NOT EXISTS operations_owner_idx ON operations(owner, createdAt)");
    this.db.run("CREATE INDEX IF NOT EXISTS agents_owner_idx ON agents(owner, createdAt)");
  }
  close() {
    this.db.close();
  }

  createChallenge(row: Omit<Challenge, "usedAt"> & { usedAt?: number | null }): Challenge {
    this.db
      .query("INSERT INTO challenges (id,message,address,expiresAt,usedAt) VALUES (?,?,?,?,?)")
      .run(row.id, row.message, row.address, row.expiresAt, row.usedAt ?? null);
    return this.getChallenge(row.id)!;
  }
  getChallenge(id: string): Challenge | null {
    return (
      (this.db.query("SELECT * FROM challenges WHERE id=?").get(id) as Challenge | null) ?? null
    );
  }
  consumeChallenge(id: string, now: number): Challenge | null {
    const tx = this.db.transaction(() => {
      const row = this.getChallenge(id);
      if (!row || row.usedAt !== null || row.expiresAt <= now) return null;
      this.db
        .query("UPDATE challenges SET usedAt=? WHERE id=? AND usedAt IS NULL AND expiresAt>?")
        .run(now, id, now);
      return this.getChallenge(id);
    });
    return tx() as Challenge | null;
  }

  createSession(hash: string, address: string, expiresAt: number): Session {
    this.db
      .query("INSERT INTO sessions(hash,address,expiresAt) VALUES(?,?,?)")
      .run(hash, address, expiresAt);
    return { hash, address, expiresAt };
  }
  session(hash: string, now: number): string | null {
    const r = this.db
      .query("SELECT address FROM sessions WHERE hash=? AND expiresAt>?")
      .get(hash, now) as { address: string } | null;
    return r?.address ?? null;
  }
  deleteSession(hash: string): boolean {
    return this.db.query("DELETE FROM sessions WHERE hash=?").run(hash).changes > 0;
  }

  createAgent(
    input: { name: string; owner: string; account: string; tokenHash: string; expiresAt: number },
    now: number,
  ): Agent {
    const id = crypto.randomUUID();
    this.db
      .query(
        "INSERT INTO agents(id,name,owner,account,tokenHash,expiresAt,revokedAt,createdAt) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(id, input.name, input.owner, input.account, input.tokenHash, input.expiresAt, null, now);
    return this.agentById(id)!;
  }
  private agentById(id: string): Agent | null {
    return (
      (this.db
        .query("SELECT id,name,owner,account,expiresAt,revokedAt,createdAt FROM agents WHERE id=?")
        .get(id) as Agent | null) ?? null
    );
  }
  authenticateAgent(tokenHash: string, now: number): Agent | null {
    return (
      (this.db
        .query(
          "SELECT id,name,owner,account,expiresAt,revokedAt,createdAt FROM agents WHERE tokenHash=? AND revokedAt IS NULL AND expiresAt>? ",
        )
        .get(tokenHash, now) as Agent | null) ?? null
    );
  }
  listAgents(owner: string): Agent[] {
    return this.db
      .query(
        "SELECT id,name,owner,account,expiresAt,revokedAt,createdAt FROM agents WHERE owner=? ORDER BY createdAt",
      )
      .all(owner) as Agent[];
  }
  revokeAgent(id: string, owner: string, now: number): boolean {
    const r = this.db
      .query("UPDATE agents SET revokedAt=? WHERE id=? AND owner=? AND revokedAt IS NULL")
      .run(now, id, owner);
    return r.changes > 0;
  }

  propose(agent: Agent, intent: any, intentHash: string, now: number): Operation;
  propose(
    agent: Agent,
    intent: any,
    intentHash: string,
    idempotencyKey: string,
    now: number,
  ): Operation;
  propose(
    agent: Agent,
    intent: any,
    intentHash: string,
    keyOrNow: string | number,
    maybeNow?: number,
  ): Operation {
    const idempotencyKey = typeof keyOrNow === "number" ? intent?.idempotencyKey : keyOrNow;
    const now = typeof keyOrNow === "number" ? keyOrNow : maybeNow!;
    if (typeof idempotencyKey !== "string" || !idempotencyKey)
      throw new Error("idempotency key required");
    const tx = this.db.transaction(() => {
      const existing = this.db
        .query("SELECT * FROM operations WHERE agentId=? AND idempotencyKey=?")
        .get(agent.id, idempotencyKey) as any;
      if (existing) {
        if (existing.intentHash !== intentHash) throw new Error("idempotency key conflict");
        return this.decodeOperation(existing);
      }
      const id = crypto.randomUUID();
      this.db
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
      return this.decodeOperation(
        this.db.query("SELECT * FROM operations WHERE id=?").get(id) as any,
      );
    });
    return tx() as Operation;
  }
  private decodeOperation(row: any): Operation {
    const operation = { ...row, intent: JSON.parse(row.intent) } as Operation;
    const receipt = this.db
      .query(
        "SELECT transactionHash,userOpHash,success,blockNumber FROM execution_receipts WHERE operationId=?",
      )
      .get(row.id) as any;
    if (receipt) operation.execution = { ...receipt, success: Boolean(receipt.success) };
    return operation;
  }
  listOperations(owner: string): Operation[] {
    return (
      this.db.query("SELECT * FROM operations WHERE owner=? ORDER BY createdAt").all(owner) as any[]
    ).map((r) => this.decodeOperation(r));
  }
  operationForAgent(id: string, agentId: string): Operation | null {
    const r = this.db
      .query("SELECT * FROM operations WHERE id=? AND agentId=?")
      .get(id, agentId) as any;
    return r ? this.decodeOperation(r) : null;
  }
  operationForOwner(id: string, owner: string): Operation | null {
    const r = this.db
      .query("SELECT * FROM operations WHERE id=? AND owner=?")
      .get(id, owner) as any;
    return r ? this.decodeOperation(r) : null;
  }
  recordExecution(id: string, owner: string, receipt: ExecutionReceipt, now: number): Operation {
    const tx = this.db.transaction(() => {
      const row = this.db
        .query("SELECT * FROM operations WHERE id=? AND owner=?")
        .get(id, owner) as any;
      if (!row) throw new Error("operation not found");
      if (row.status !== "approved") throw new Error("operation not approved");
      const existing = this.db
        .query("SELECT transactionHash FROM execution_receipts WHERE operationId=?")
        .get(id) as { transactionHash: string } | null;
      if (existing && existing.transactionHash !== receipt.transactionHash)
        throw new Error("Execution receipt conflict");
      this.db
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
      return this.decodeOperation(
        this.db.query("SELECT * FROM operations WHERE id=?").get(id) as any,
      );
    });
    return tx() as Operation;
  }
  setPrepared(id: string, owner: string, payload: any, now: number): boolean {
    const row = this.db
      .query("SELECT intent,status FROM operations WHERE id=? AND owner=?")
      .get(id, owner) as any;
    if (!row || row.status !== "approval_required") throw new Error("operation not pending");
    if (this.intentExpired(row.intent, now)) throw new Error("intent expired");
    const busy = this.db
      .query(`SELECT o.id FROM operations o JOIN prepared_operations p ON p.operationId=o.id
      LEFT JOIN execution_receipts e ON e.operationId=o.id
      WHERE o.id<>? AND json_extract(o.intent,'$.account')=? AND e.operationId IS NULL
      AND (o.status='approved' OR (o.status='approval_required' AND json_extract(o.intent,'$.expiresAt')>? AND json_extract(p.payload,'$.preparedUntil')>?)) LIMIT 1`)
      .get(id, JSON.parse(row.intent).account, now, now);
    if (busy)
      throw new Error(
        "Account has another prepared or signed payment; resolve it first (nonce conflict)",
      );
    const existing = this.getPrepared(id, owner);
    if (existing?.preparedUntil > now && existing.actionHash !== payload.actionHash)
      throw new Error("Prepared payment conflict");
    this.db
      .query(
        "INSERT INTO prepared_operations(operationId,payload,createdAt) VALUES(?,?,?) ON CONFLICT(operationId) DO UPDATE SET payload=excluded.payload,createdAt=excluded.createdAt",
      )
      .run(id, JSON.stringify(payload), now);
    return true;
  }
  getPrepared(id: string, owner: string): any | null {
    const allowed = this.db.query("SELECT 1 FROM operations WHERE id=? AND owner=?").get(id, owner);
    if (!allowed) return null;
    const row = this.db
      .query("SELECT payload FROM prepared_operations WHERE operationId=?")
      .get(id) as { payload: string } | null;
    return row ? JSON.parse(row.payload) : null;
  }
  private intentExpired(raw: string, now: number): boolean {
    const intent = JSON.parse(raw);
    return typeof intent?.expiresAt === "number" && intent.expiresAt <= now;
  }
  recordApproval(id: string, owner: string, signature: string, now: number): Operation {
    const tx = this.db.transaction(() => {
      const row = this.db
        .query("SELECT * FROM operations WHERE id=? AND owner=?")
        .get(id, owner) as any;
      if (!row) throw new Error("operation not found");
      const prior = this.db.query("SELECT signature FROM signatures WHERE opId=?").get(id) as {
        signature: string;
      } | null;
      if (row.status === "approved" && prior?.signature === signature)
        return this.decodeOperation(row);
      if (row.status !== "approval_required") throw new Error("decision conflict");
      if (this.intentExpired(row.intent, now)) {
        this.db
          .query(
            "UPDATE operations SET status='rejected',updatedAt=?,decisionReason='intent expired' WHERE id=?",
          )
          .run(now, id);
        return {
          expired: true,
          operation: this.decodeOperation(
            this.db.query("SELECT * FROM operations WHERE id=?").get(id) as any,
          ),
        };
      }
      const prepared = this.db
        .query("SELECT 1 FROM prepared_operations WHERE operationId=?")
        .get(id);
      if (!prepared) throw new Error("operation not prepared");
      this.db
        .query(
          "UPDATE operations SET status='approved',updatedAt=?,decisionReason=NULL WHERE id=? AND status='approval_required'",
        )
        .run(now, id);
      this.db
        .query("INSERT INTO signatures(opId,signature,createdAt) VALUES(?,?,?)")
        .run(id, signature, now);
      return this.decodeOperation(
        this.db.query("SELECT * FROM operations WHERE id=?").get(id) as any,
      );
    });
    const result = tx() as Operation | { expired: true; operation: Operation };
    if ("expired" in result) throw new Error("intent expired");
    return result;
  }
  decide(
    id: string,
    owner: string,
    decision: "approved" | "rejected",
    reason: string | null,
    now: number,
  ): Operation {
    const row = this.db
      .query("SELECT * FROM operations WHERE id=? AND owner=?")
      .get(id, owner) as any;
    if (!row) throw new Error("operation not found");
    if (row.status !== "approval_required") {
      if (row.status === decision) return this.decodeOperation(row);
      throw new Error("decision conflict");
    }
    if (row.createdAt > now) throw new Error("invalid time");
    if (decision === "approved" && this.intentExpired(row.intent, now)) {
      decision = "rejected";
      reason = reason ?? "intent expired";
    }
    this.db
      .query(
        "UPDATE operations SET status=?,updatedAt=?,decisionReason=? WHERE id=? AND status='approval_required'",
      )
      .run(decision, now, reason, id);
    return this.decodeOperation(
      this.db.query("SELECT * FROM operations WHERE id=?").get(id) as any,
    );
  }
  audit(event: Omit<AuditEvent, "id">): AuditEvent {
    const id = crypto.randomUUID();
    this.db
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
  listAudit(owner: string): AuditEvent[] {
    return (
      this.db
        .query("SELECT * FROM audit_events WHERE owner=? ORDER BY createdAt")
        .all(owner) as any[]
    ).map((r) => ({ ...r, details: r.details == null ? null : JSON.parse(r.details) }));
  }
}
