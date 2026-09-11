import { mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "./store";
import { createApp } from "./app";
import { liveChain } from "./chain";
import { runtimeIntegrations } from "./runtime-integrations";
const dir = resolve(import.meta.dir, "../../../.local/gateway");
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);
const store = new Store(`${dir}/mandate.sqlite`);
await store.db.ready;
chmodSync(`${dir}/mandate.sqlite`, 0o600);
const dashboardOrigin = process.env.MANDATE_DASHBOARD_ORIGIN ?? "http://localhost:3000";
const dashboardUrl = new URL(dashboardOrigin);
if (dashboardUrl.origin !== dashboardOrigin || dashboardUrl.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(dashboardUrl.hostname)) {
  throw new Error("The local dashboard must use an exact loopback HTTP origin.");
}
const chain = liveChain();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3001,
  fetch: createApp(store, chain, { dashboardOrigin, ...runtimeIntegrations(store, chain, 'http://127.0.0.1:3001', dashboardOrigin) }),
});
console.log(`Mandate gateway: ${server.url} (local, human approval required)`);
process.on("SIGINT", () => {
  server.stop();
  store.close();
  process.exit(0);
});
