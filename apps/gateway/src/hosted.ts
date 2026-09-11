import type { Store } from "./store";
import type { Chain } from "./chain";
import { createApp } from "./app";
import { runtimeIntegrations } from "./runtime-integrations";

/** Serve the existing gateway in-process, without trusting forwarded host headers. */
export function createHostedGateway(store: Store, chain: Chain, origins: string[]) {
  const handlers = new Map<string, ReturnType<typeof createApp>>();
  for (const origin of origins) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
    )
      throw new Error("Gateway origins must be exact HTTPS origins");
    handlers.set(
      origin,
      createApp(store, chain, { dashboardOrigin: origin, gatewayOrigin: origin, ...runtimeIntegrations(store, chain, origin) }),
    );
  }
  return async (request: Request) => {
    const url = new URL(request.url);
    const handler = handlers.get(url.origin);
    if (!handler || !url.pathname.startsWith("/gateway/"))
      return Response.json({ error: "Unexpected gateway host or path" }, { status: 403 });
    url.pathname = url.pathname.slice("/gateway".length);
    try {
      await store.db.ready;
      if (url.pathname === "/health") await store.db.query("SELECT 1").get();
    } catch {
      return Response.json(
        { error: "Gateway storage is unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return handler(new Request(url, request));
  };
}
