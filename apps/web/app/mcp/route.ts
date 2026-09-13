import { createMcpHandler } from '../../../../packages/agent-tools/src/http';
import { POST as gateway } from '../gateway/[...path]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const handler = createMcpHandler(gateway, [
  'https://www.wayleave.xyz',
  'https://wayleave.xyz',
  ...(process.env.MANDATE_DASHBOARD_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? []),
]);
export { handler as POST, handler as GET, handler as DELETE };
