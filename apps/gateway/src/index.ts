import { mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "./store";
import { createApp } from "./app";
import { liveChain } from "./chain";
const dir = resolve(import.meta.dir, "../../../.local/gateway");
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);
const store = new Store(`${dir}/mandate.sqlite`);
chmodSync(`${dir}/mandate.sqlite`, 0o600);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3001,
  fetch: createApp(store, liveChain()),
});
console.log(`Mandate gateway: ${server.url} (local, human approval required)`);
process.on("SIGINT", () => {
  server.stop();
  store.close();
  process.exit(0);
});
