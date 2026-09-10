import {
  createSIWEConfig,
  formatMessage,
  type SIWESession,
} from '@reown/appkit-siwe';

export const ownerSessionEvent = 'wayleave:owner-session';
type Challenge = {
  nonce: string;
  domain: string;
  uri: string;
  statement: string;
  issuedAt: string;
  expirationTime: string;
};

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

let challenge: Promise<Challenge> | undefined;
function getChallenge() {
  challenge ??= request<Challenge>('/auth/siwe/nonce', {}).catch((error) => {
    challenge = undefined;
    throw error;
  });
  return challenge;
}
function notify(session: SIWESession | null) {
  window.dispatchEvent(new CustomEvent(ownerSessionEvent, { detail: session }));
}

export const ownerAuth = createSIWEConfig({
  required: true,
  async getMessageParams() {
    challenge = undefined;
    const data = await getChallenge();
    if (
      data.domain !== window.location.host ||
      data.uri !== window.location.origin
    )
      throw new Error('The gateway is configured for a different website.');
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
    return (await getChallenge()).nonce;
  },
  createMessage({ address, ...args }) {
    return formatMessage(args, address);
  },
  async verifyMessage({ message, signature }) {
    try {
      await request<SIWESession>('/auth/siwe/verify', { message, signature });
      return true;
    } finally {
      challenge = undefined;
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
    challenge = undefined;
    return true;
  },
  onSignIn: (session) => {
    if (session) notify(session);
  },
  onSignOut: () => notify(null),
});
