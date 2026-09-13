'use client';

import { useEffect, useRef, useState } from 'react';
import { useSignMessage } from 'wagmi';
import { isAddress, type Address } from 'viem';
import {
  agentSessionLengths,
  agentTokenMessage,
  type AgentTokenGrant,
  type AgentTokenScope,
  type PortableIdentity,
} from '@mandate/sdk';
import { WayleaveSelect } from './wayleave-select';
import { PortableMcpSetup } from './portable-mcp-setup';
import { gatewayResponse } from '../lib/gateway-response';

type Connection = {
  id: string;
  name: string;
  account: Address;
  scopes: AgentTokenScope[];
  expiresAt: number;
  revokedAt: number | null;
  createdAt: number;
};
async function api<T>(path: string, body?: unknown) {
  return gatewayResponse<T>(
    await fetch(`/gateway/identity/tokens${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
export function AgentTokenManager({
  identity,
  account,
  gateway,
  audience,
  onReady,
}: {
  identity: PortableIdentity;
  account: string;
  gateway: string;
  audience?: string;
  onReady: (ready: boolean) => void;
}) {
  const [label, setLabel] = useState('assistant');
  const [selectedAccount, setSelectedAccount] = useState(account);
  const [duration, setDuration] = useState(86400);
  const [propose, setPropose] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [issued, setIssued] = useState<{
    token: string;
    connection: Connection;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now() / 1000);
  const sign = useSignMessage();
  const mounted = useRef(true);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    setSelectedAccount(account);
  }, [account]);
  useEffect(() => {
    mounted.current = true;
    void api<{ connections: Connection[] }>('')
      .then((result) => {
        if (mounted.current) setConnections(previous => Array.from(new Map([...result.connections, ...previous].map(connection => [connection.id, connection])).values()));
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      });
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      ready.current(false);
    };
  }, []);
  useEffect(() => {
    ready.current(
      connections.some(
        (c) =>
          !c.revokedAt &&
          c.expiresAt > now &&
          c.account.toLowerCase() === selectedAccount.toLowerCase() &&
          c.scopes.includes('propose_payment'),
      ),
    );
  }, [connections, selectedAccount, now]);
  const activeIssued =
    issued && !issued.connection.revokedAt && issued.connection.expiresAt > now
      ? issued
      : undefined;
  async function issue() {
    setBusy(true);
    setError('');
    try {
      const scopes: AgentTokenScope[] = propose
        ? ['read', 'propose_payment']
        : ['read'];
      const { grant, message } = await api<{
        grant: AgentTokenGrant;
        message: string;
      }>('/challenge', {
        name: label,
        chainId: 5042002,
        account: selectedAccount,
        scopes,
        durationSeconds: duration,
      });
      const timestamp = Date.now() / 1000;
      if (
        grant.version !== 1 ||
        grant.audience !== new URL(audience ?? window.location.origin).origin ||
        grant.identity !== identity.name ||
        grant.registration !== identity.registration ||
        grant.identityController.toLowerCase() !==
          identity.controller.toLowerCase() ||
        grant.account.toLowerCase() !== selectedAccount.toLowerCase() ||
        grant.chainId !== 5042002 ||
        grant.name !== `${label}.${identity.name}` ||
        JSON.stringify(grant.scopes) !== JSON.stringify(scopes) ||
        grant.durationSeconds !== duration ||
        !Number.isSafeInteger(grant.tokenExpiresAt) ||
        grant.tokenExpiresAt <= timestamp ||
        grant.tokenExpiresAt >
          Math.min(timestamp + duration, identity.expiresAt) ||
        grant.expiresAt <= timestamp ||
        grant.expiresAt > timestamp + 305 ||
        !/^[a-f0-9]{64}$/.test(grant.nonce) ||
        message !== agentTokenMessage(grant)
      )
        throw new Error(
          'Token authorization does not match your selected account, permissions or session length.',
        );
      if (!mounted.current) return;
      const signature = await sign.mutateAsync({ message });
      if (!mounted.current) return;
      const result = await api<{ token: string; connection: Connection }>(
        '/issue',
        { nonce: grant.nonce, signature },
      );
      if (!mounted.current) return;
      setIssued(result);
      setConnections((previous) => [result.connection, ...previous]);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'Could not create token');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function revoke(connection: Connection) {
    setBusy(true);
    setError('');
    try {
      await api(`/${connection.id}/revoke`, {});
      if (!mounted.current) return;
      const revokedAt = Math.floor(Date.now() / 1000);
      setConnections((previous) =>
        previous.map((c) => (c.id === connection.id ? { ...c, revokedAt } : c)),
      );
      if (issued?.connection.id === connection.id) setIssued(undefined);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'Could not revoke token');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="mcp-setup-options" aria-label="Agent bearer tokens">
      <h3>Create an agent connection</h3>
      <p>
        Sign with your wallet to issue a bearer token for this agent and
        account. No agent key or registry transaction is needed. Payments still
        require your separate approval.
      </p>
      <label>
        Connection label
        <input
          value={label}
          disabled={busy}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="research-assistant"
        />
      </label>
      <label>
        Associated Arc account
        <input
          value={selectedAccount}
          disabled={busy}
          onChange={(e) => setSelectedAccount(e.target.value)}
          placeholder="0x…"
        />
      </label>
      <p>
        Use an account already linked to this ENS identity in the wallet step.
      </p>
      <label>
        Session length
        <WayleaveSelect
          label="Session length"
          value={String(duration)}
          disabled={busy}
          onValueChange={(value) => setDuration(Number(value))}
          options={agentSessionLengths.map((choice) => ({
            value: String(choice.value),
            label: choice.label,
          }))}
        />
      </label>
      <p>
        The signed expiry cannot outlast your ENS name (
        {new Date(identity.expiresAt * 1000).toLocaleString()}). Create a new
        token after expiry; revoke any token below.
      </p>
      <label className="agent-token-permissions">
        <input
          type="checkbox"
          checked={propose}
          disabled={busy}
          onChange={(e) => setPropose(e.target.checked)}
        />
        Allow payment proposals in addition to reading
      </label>
      <button
        type="button"
        disabled={
          busy ||
          !isAddress(selectedAccount) ||
          !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
        }
        onClick={() => void issue()}
      >
        {busy ? 'Working…' : 'Sign and create bearer token'}
      </button>
      {error && <p role="alert">{error}</p>}
      {activeIssued && (
        <p role="status">
          Token created for {activeIssued.connection.name}. Expires{' '}
          {new Date(activeIssued.connection.expiresAt * 1000).toLocaleString()}.
          Copy its settings now; the token is only shown once.
        </p>
      )}
      <PortableMcpSetup
        identity={identity.name}
        agentName={activeIssued?.connection.name ?? `${label}.${identity.name}`}
        account={activeIssued?.connection.account ?? selectedAccount}
        gateway={gateway}
        token={activeIssued?.token}
        expiresAt={activeIssued?.connection.expiresAt}
      />
      {connections.length > 0 && (
        <div>
          <h3>Your connections</h3>
          {connections.map((connection) => (
            <div key={connection.id}>
              <strong>{connection.name}</strong>
              <p>
                {connection.account} ·{' '}
                {connection.scopes.includes('propose_payment')
                  ? 'Read and propose'
                  : 'Read only'}
              </p>
              <p>
                {connection.revokedAt
                  ? 'Revoked'
                  : connection.expiresAt <= now
                    ? 'Expired'
                    : `Expires ${new Date(connection.expiresAt * 1000).toLocaleString()}`}
              </p>
              {!connection.revokedAt && connection.expiresAt > now && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revoke(connection)}
                >
                  Revoke {connection.name}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
