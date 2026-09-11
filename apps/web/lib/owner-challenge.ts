export type OwnerChallenge = {
  nonce: string;
  domain: string;
  uri: string;
  statement: string;
  issuedAt: string;
  expirationTime: string;
};

// Prepare before displaying the wallet picker/sign button. A network round trip
// during the Sign click can prevent iOS Safari from opening the wallet app.
export function createOwnerChallengeCache(
  fetchChallenge: () => Promise<OwnerChallenge>,
  now = Date.now,
) {
  let pending: Promise<OwnerChallenge> | undefined;
  let value: OwnerChallenge | undefined;
  return {
    get() {
      if (value && Date.parse(value.expirationTime) - now() > 30_000)
        return Promise.resolve(value);
      if (pending) return pending;
      const request = fetchChallenge()
        .then((result) => {
          if (pending === request) value = result;
          return result;
        })
        .finally(() => {
          if (pending === request) pending = undefined;
        });
      pending = request;
      return request;
    },
    clear() {
      value = undefined;
      pending = undefined;
    },
  };
}
