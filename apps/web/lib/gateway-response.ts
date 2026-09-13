/** Proxies may return plain text or HTML when the gateway is unreachable. */
export async function gatewayResponse<T>(response: Response): Promise<T> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error(
      'Wayleave could not reach the gateway. Please try again in a moment.',
    );
  }
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && 'error' in value
        ? value.error
        : undefined;
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message
        : 'The gateway could not complete this request. Please try again.',
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      'The gateway returned an unexpected response. Please try again.',
    );
  }
  return value as T;
}
