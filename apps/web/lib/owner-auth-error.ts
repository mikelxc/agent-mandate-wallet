export const ownerAuthErrorEvent = 'wayleave:owner-auth-error';

export function reportOwnerAuthError(error: unknown) {
  const failure = error as { details?: unknown; shortMessage?: unknown; message?: unknown } | null;
  const reason = [failure?.details, failure?.shortMessage, failure?.message]
    .find(value => typeof value === 'string' && value.trim()) as string | undefined;
  const message = reason?.split('\n')[0]?.slice(0, 300)
    || 'Open your wallet and try the sign-in request again.';
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(ownerAuthErrorEvent, {
      detail: `Sign-in failed: ${message}`,
    }));
}
