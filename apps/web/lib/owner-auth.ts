import {
  createSIWEConfig,
  formatMessage,
  getDidAddress,
  type SIWESession,
} from '@reown/appkit-siwe';
import { getAddress } from 'viem';
import { reportOwnerAuthError } from './owner-auth-error';
import {
  createOwnerChallengeCache,
  type OwnerChallenge,
} from './owner-challenge';

export const ownerSessionEvent = 'wayleave:owner-session';

async function request<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/gateway${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (response.status === 503)
    throw new Error(
      'Ownership verification is unavailable because the hosted gateway is not configured.',
    );
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error ?? 'Ownership verification failed.');
  return value as T;
}

const challenge = createOwnerChallengeCache(() =>
  request<OwnerChallenge>('/auth/siwe/nonce', {}),
);
let signingChallenge: OwnerChallenge | undefined;
export async function prepareOwnerAuth() {
  const data = await challenge.get();
  if (
    data.domain !== window.location.host ||
    data.uri !== window.location.origin
  )
    throw new Error('The gateway is configured for a different website.');
  return data;
}
function notify(session: SIWESession | null) {
  window.dispatchEvent(new CustomEvent(ownerSessionEvent, { detail: session }));
}

export const ownerAuth = createSIWEConfig({
  required: true,
  // The cookie proves the wallet identity. Each payment route independently
  // verifies account ownership and signs for its own chain.
  signOutOnNetworkChange: false,
  signOutOnAccountChange: true,
  signOutOnDisconnect: true,
  async getMessageParams() {
    const data = await prepareOwnerAuth();
    signingChallenge = data;
    return {
      domain: data.domain,
      uri: data.uri,
      chains: [11155111],
      statement: data.statement,
      iat: data.issuedAt,
      exp: data.expirationTime,
    };
  },
  async getNonce() {
    return (signingChallenge ?? (await prepareOwnerAuth())).nonce;
  },
  createMessage({ address, ...args }) {
    if (args.chainId !== 11155111) {
      const error = new Error('Switch your wallet to Sepolia before signing in.');
      reportOwnerAuthError(error);
      throw error;
    }
    // WalletConnect accounts can be lowercase. EIP-4361 requires an EIP-55
    // address in the message; stricter wallets reject the lowercase variant.
    const walletAddress = address.startsWith('did:pkh:')
      ? getDidAddress(address)
      : address;
    if (!walletAddress) throw new Error('Wallet address is missing from sign-in request.');
    const owner = getAddress(walletAddress);
    return formatMessage(args, `did:pkh:eip155:${args.chainId}:${owner}`);
  },
  async verifyMessage({ message, signature }) {
    try {
      await request<SIWESession>('/auth/siwe/verify', { message, signature });
      return true;
    } catch (error) {
      reportOwnerAuthError(error);
      throw error;
    } finally {
      challenge.clear();
      signingChallenge = undefined;
    }
  },
  async getSession() {
    const response = await fetch('/gateway/auth/session', {
      credentials: 'same-origin',
    });
    if (response.status === 401 || response.status === 503) return null;
    if (!response.ok) throw new Error('Could not check the owner session.');
    return response.json() as Promise<SIWESession>;
  },
  async signOut() {
    await request('/auth/logout', {});
    challenge.clear();
    signingChallenge = undefined;
    return true;
  },
  onSignIn: (session) => {
    if (session) notify(session);
  },
  onSignOut: () => notify(null),
});
