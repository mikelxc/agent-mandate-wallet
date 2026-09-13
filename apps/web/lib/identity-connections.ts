import { gatewayResponse } from './gateway-response';

/** Wallet sign-in does not imply an ENS identity proof (which expires separately). */
export async function identityConnections<T>(
  response: Response,
): Promise<{ connections: T[]; verificationRequired: boolean }> {
  if (response.status === 400 || response.status === 401) {
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    if (body?.error === 'Identity session required') {
      return { connections: [], verificationRequired: true };
    }
  }
  const result = await gatewayResponse<{ connections: T[] }>(response);
  if (!Array.isArray(result.connections))
    throw new Error(
      'The gateway returned invalid agent connections. Please retry.',
    );
  return { connections: result.connections, verificationRequired: false };
}
