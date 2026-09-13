import type { Address } from 'viem';

export const agentSessionLengths = [
  { value: 900, label: '15 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 86400, label: '24 hours' },
  { value: 604800, label: '7 days' },
  { value: 2592000, label: '30 days' },
] as const;
export type AgentTokenScope = 'read' | 'propose_payment';
export type AgentTokenGrant = {
  version: 1; audience: string; identity: string; registration: string;
  identityController: Address; name: string; chainId: number; account: Address;
  accountController: Address; accountEpoch: string; scopes: AgentTokenScope[];
  durationSeconds: number; tokenExpiresAt: number; nonce: string; expiresAt: number;
};
export function agentTokenMessage(grant: AgentTokenGrant) {
  return `Wayleave agent bearer token v1\nAuthorize only the named agent, account, permissions and expiry below. This token cannot sign transactions or move funds; payments require separate owner approval.\n${JSON.stringify(grant)}`;
}
