'use client';
import { useEffect, useState } from 'react';
import { bytesToHex } from 'viem';
import { encodePasskeyProof, validLabel } from '@mandate/sdk';
import { Fingerprint, ArrowRight } from 'lucide-react';
async function accountResponse(response: Response) {
  try { return await response.json(); }
  catch { throw new Error('Account setup is unavailable right now. Please try again later.'); }
}

function derSignature(bytes: Uint8Array) {
  let i = 2;
  if (bytes[0] !== 0x30) throw new Error('Invalid passkey signature');
  const read = () => {
    if (bytes[i++] !== 2) throw new Error('Invalid passkey signature');
    const n = bytes[i++];
    const v = bytes.slice(i, i + n);
    i += n;
    return BigInt(
      `0x${Array.from(v)
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')}`,
    );
  };
  return { r: read(), s: read() };
}
function publicKeyCoordinates(key: ArrayBuffer) {
  const bytes = new Uint8Array(key);
  const point = bytes.slice(bytes.length - 65);
  if (point[0] !== 4)
    throw new Error('Passkey did not return a P-256 public key');
  return {
    x: BigInt(
      `0x${Array.from(point.slice(1, 33))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')}`,
    ),
    y: BigInt(
      `0x${Array.from(point.slice(33))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')}`,
    ),
  };
}
function proofFromAssertion(assertion: PublicKeyCredential, challenge: string) {
  const response = assertion.response as AuthenticatorAssertionResponse;
  const clientDataJSON = new TextDecoder().decode(response.clientDataJSON);
  const parsed = JSON.parse(clientDataJSON);
  if (parsed.challenge !== challenge || parsed.type !== 'webauthn.get')
    throw new Error('Passkey challenge mismatch');
  const { r, s } = derSignature(new Uint8Array(response.signature));
  return encodePasskeyProof(
    bytesToHex(new Uint8Array(response.authenticatorData)),
    clientDataJSON,
    1n,
    r,
    s,
    false,
  );
}
function b64url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function fromB64url(value: string) {
  return Uint8Array.from(
    atob(
      value.replaceAll('-', '+').replaceAll('_', '/') +
        '='.repeat((4 - (value.length % 4)) % 4),
    ),
    (c) => c.charCodeAt(0),
  );
}
export default function AccountAccess() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState('');
  const [account, setAccount] = useState('');
  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      if (!validLabel(label))
        throw new Error(
          'Use 3–32 lowercase letters or numbers, with optional hyphens.',
        );
      setStatus('Checking availability…');
      const availability = await fetch('/gateway/passkey/availability', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const available = (await accountResponse(availability)) as {
        available?: boolean;
        error?: string;
      };
      if (!availability.ok)
        throw new Error(available.error ?? 'Account setup is unavailable.');
      if (!available.available)
        throw new Error('This name is taken. Try another.');
      setStatus('Create your passkey with your device.');
      if (!window.PublicKeyCredential)
        throw new Error('This browser does not support passkeys');
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'Wayleave' },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: `${label}@wayleave.eth`,
            displayName: label,
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential;
      if (!credential) throw new Error('Passkey creation was cancelled');
      const response = credential.response as AuthenticatorAttestationResponse;
      const publicKey = response.getPublicKey?.();
      if (!publicKey)
        throw new Error(
          'This browser cannot export a passkey public key. Try a supported browser.',
        );
      const key = publicKeyCoordinates(publicKey);
      const challenge = await fetch('/gateway/passkey/registration/challenge', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          credentialId: b64url(credential.rawId),
          key: { x: key.x.toString(), y: key.y.toString() },
        }),
      });
      const c: any = await accountResponse(challenge);
      if (!challenge.ok)
        throw new Error(c.error ?? 'Could not prepare registration');
      setStatus('Approve account registration with the same passkey…');
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: fromB64url(c.challenge),
          rpId: c.rpId,
          allowCredentials: [{ type: 'public-key', id: credential.rawId }],
          userVerification: 'required',
          timeout: 60000,
        },
      })) as PublicKeyCredential;
      if (!assertion) throw new Error('Registration approval was cancelled.');
      const proof = proofFromAssertion(assertion, c.challenge);
      const done = await fetch('/gateway/passkey/registration/complete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: c.id,
          label,
          credentialId: b64url(credential.rawId),
          key: { x: key.x.toString(), y: key.y.toString() },
          proof,
        }),
      });
      const result: any = await accountResponse(done);
      if (!done.ok)
        throw new Error(result.error ?? 'Account deployment failed');
      setAccount(result.account);
      setStatus(
        `Created ${result.label}. Transaction ${result.transactionHash.slice(0, 12)}…`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Account setup failed. Check the gateway and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="wl-account-access" aria-labelledby="passkey-heading">
      <div>
        <Fingerprint size={23} />
        <h2 id="passkey-heading">Your account, one passkey.</h2>
        <p>
          Create an account without a browser wallet. Your device confirms setup
          and future access.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label htmlFor="account-label">Account name</label>
        <div className="wl-name-input">
          <input
            id="account-label"
            value={label}
            onChange={(e) => setLabel(e.target.value.toLowerCase())}
            maxLength={32}
            placeholder="your-name"
            autoComplete="off"
            disabled={busy || !ready}
            required
          />
          <span>.wayleave.eth</span>
        </div>
        <p className="wl-secondary">
          Sepolia testing · Requires the configured registration service.
        </p>
        <button className="wl-action" disabled={busy || !ready} type="submit">
          {busy ? 'Setting up…' : 'Create with passkey'}
          <ArrowRight size={16} />
        </button>
        {status && (
          <p role="status" className="wl-access-status">
            {status}
          </p>
        )}
        {account && (
          <p className="wl-access-status">
            Account: <code>{account}</code>
          </p>
        )}
      </form>
    </section>
  );
}
