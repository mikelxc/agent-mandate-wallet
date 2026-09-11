import { createClient } from '@libsql/client/web';
import { Store } from '@mandate/gateway/store';
import { liveChain } from '@mandate/gateway/chain';
import { createHostedGateway } from '@mandate/gateway/hosted';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

let handler: ReturnType<typeof createHostedGateway> | undefined;
async function gateway(request: Request) {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const origins = Array.from(
    new Set([
      'https://wayleave.xyz',
      'https://www.wayleave.xyz',
      ...(process.env.MANDATE_DASHBOARD_ORIGINS?.split(',') ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ]),
  );
  if (!url || !authToken) {
    return Response.json(
      {
        error:
          'The hosted gateway database is not configured. Ownership verification is unavailable.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  try {
    handler ??= createHostedGateway(
      new Store(createClient({ url, authToken })),
      liveChain(),
      origins,
    );
    const response = await handler(request);
    if (response.status === 503) handler = undefined;
    return response;
  } catch {
    handler = undefined;
    return Response.json(
      { error: 'The gateway is temporarily unavailable. Please retry.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export {
  gateway as GET,
  gateway as POST,
  gateway as PUT,
  gateway as PATCH,
  gateway as DELETE,
  gateway as OPTIONS,
};
