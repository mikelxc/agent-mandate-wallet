import type { Client, InValue, Transaction } from "@libsql/client";

/** One asynchronous SQL interface for local SQLite and Vercel's remote Turso database. */
export class SqlDatabase {
  readonly ready: Promise<unknown>;
  constructor(
    readonly client: Client | Transaction,
    schema?: string[],
  ) {
    this.ready =
      schema && "transaction" in client ? client.batch(schema, "write") : Promise.resolve();
  }

  query(sql: string) {
    const execute = async (args: InValue[]) => {
      await this.ready;
      return this.client.execute({ sql, args });
    };
    const rows = async (args: InValue[]) => {
      const result = await execute(args);
      return result.rows.map((row) =>
        Object.fromEntries(result.columns.map((column) => [column, row[column]])),
      );
    };
    return {
      get: async (...args: InValue[]): Promise<unknown> => (await rows(args))[0] ?? null,
      all: async (...args: InValue[]): Promise<unknown[]> => rows(args),
      run: async (...args: InValue[]) => ({ changes: (await execute(args)).rowsAffected }),
    };
  }

  async transaction<T>(callback: (db: SqlDatabase) => Promise<T>): Promise<T> {
    await this.ready;
    if (!("transaction" in this.client)) throw new Error("Nested transaction not supported");
    const tx = await this.client.transaction("write");
    try {
      const result = await callback(new SqlDatabase(tx));
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }

  close() {
    this.client.close();
  }
}
