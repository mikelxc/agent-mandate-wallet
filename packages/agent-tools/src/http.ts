import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createGatewayClient } from './client';
import { createAgentServer } from './tools';

/** Each request authenticates independently; no shared credentials or sessions. */
export function createMcpHandler(gateway: (request: Request) => Promise<Response>, origins: string[]) {
  return async (request: Request) => {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    if (!origins.includes(url.origin) || (origin && !origins.includes(origin)))
      return new Response('Forbidden origin', { status: 403 });
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    const authorization = request.headers.get('authorization');
    if (!authorization || !/^Bearer [^\s]+$/i.test(authorization))
      return new Response('Bearer connection key required', { status: 401, headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' } });
    if (request.headers.has('x-wayleave-account')) return new Response('The bearer token selects the account. Remove x-wayleave-account.', { status: 400 });
    const fetchImpl = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const target = new URL(String(input));
      target.protocol = url.protocol;
      target.host = url.host;
      const headers = new Headers(init?.headers);
      return gateway(new Request(target, { ...init, headers }));
    };
    const authenticated = await fetchImpl('https://www.wayleave.xyz/gateway/agent/account', { headers: { Authorization: authorization } });
    if (!authenticated.ok) return new Response('Gateway authentication unavailable or connection key invalid', {
      status: authenticated.status === 401 || authenticated.status === 403 ? 401 : 503,
      headers: { 'Cache-Control': 'no-store', 'WWW-Authenticate': 'Bearer' },
    });
    const server = createAgentServer(createGatewayClient({ token: authorization.slice(7), baseUrl: 'https://www.wayleave.xyz/gateway', fetchImpl: fetchImpl as typeof fetch }));
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      // Consume the finite JSON response before closing the request-local server.
      return new Response(await response.arrayBuffer(), { status: response.status, headers: { ...Object.fromEntries(response.headers), 'Cache-Control': 'no-store' } });
    } finally { await server.close(); }
  };
}
