import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

// Optional external gateway override; production otherwise uses the route handler.
const gatewayOrigin = process.env.MANDATE_GATEWAY_ORIGIN;
if (gatewayOrigin) {
  const url = new URL(gatewayOrigin);
  if (url.protocol !== 'https:' || url.origin !== gatewayOrigin) {
    throw new Error(
      'MANDATE_GATEWAY_ORIGIN must be an HTTPS origin without a trailing slash.',
    );
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ['@mandate/sdk', '@mandate/protocol', '@mandate/gateway'],
  turbopack: {
    // Reown is browser-only. The Base connector's Node entry imports optional
    // server payment SDKs that this wallet does not use.
    resolveAlias: { '@base-org/account': '@base-org/account/browser' },
  },
};

export default function config(phase: string): NextConfig {
  const gateway =
    gatewayOrigin ??
    (phase === PHASE_DEVELOPMENT_SERVER && !process.env.TURSO_DATABASE_URL
      ? 'http://127.0.0.1:3001'
      : undefined);
  return {
    ...nextConfig,
    async rewrites() {
      return {
        beforeFiles: gateway
          ? [{ source: '/gateway/:path*', destination: `${gateway}/:path*` }]
          : [],
        afterFiles: [],
        fallback: [],
      };
    },
  };
}
