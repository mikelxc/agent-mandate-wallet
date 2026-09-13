import { createHash } from 'node:crypto';
import type { Store } from './store';
import type { Chain } from './chain';
import type { AgentTokens } from './agent-tokens';

/** Preserve pre-ENS Sepolia connections without weakening newer signed grants. */
export function createCompatibleAgentAuth(
  store: Store,
  chain: Pick<Chain, 'ownership'>,
  scoped: AgentTokens['authenticate'],
  now = () => Math.floor(Date.now() / 1000),
) {
  return async (request: Request, chainId?: number) => {
    const current = await scoped(request, chainId);
    if (current) return current;
    if (chainId !== undefined && chainId !== 11155111) return null;
    if (request.headers.has('x-wayleave-account')) return null;
    const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) return null;
    const legacy = await store.authenticateAgent(createHash('sha256').update(token).digest('hex'), now());
    // Scoped grants also have audit rows in agents. They must never enter this path,
    // even when their signature, identity, epoch, scope or expiry no longer validates.
    if (!legacy || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(legacy.id)) return null;
    try {
      const ownership = await chain.ownership(legacy.account);
      if (ownership.owner.toLowerCase() !== legacy.owner.toLowerCase()) return null;
    } catch { return null; }
    return { ...legacy, chainId: 11155111, scopes: ['read', 'propose_payment'] };
  };
}
