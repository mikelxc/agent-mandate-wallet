'use client';
import Link from 'next/link';
import { useState } from 'react';

export type HubAgent = {
  id: string;
  name: string;
  account: string;
  expiresAt: number;
  revokedAt: number | null;
  source: 'agents' | 'identity/tokens';
};
export function SpendingAgents({
  agents,
  onRefresh,
  loading,
}: {
  agents: HubAgent[];
  onRefresh: () => void;
  loading: boolean;
}) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const now = Date.now() / 1000;
  const active = agents.filter((a) => !a.revokedAt && a.expiresAt > now);
  const archived = agents.filter((a) => a.revokedAt || a.expiresAt <= now);
  async function revoke(agent: HubAgent) {
    setBusy(agent.id);
    setMessage('');
    try {
      const response = await fetch(
        `/gateway/${agent.source}/${encodeURIComponent(agent.id)}/revoke`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).error ?? 'Could not revoke access.',
        );
      setMessage(
        'Agent access revoked. Existing signed payments and token allowances are unchanged.',
      );
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not revoke access.');
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="hub-agents" aria-label="Connected agents">
      <div className="flow-section-heading">
        <h2>
          Connected agents <span className="hub-count">{active.length}</span>
        </h2>
        <Link className="secondary" href="/connect">
          Grant agent access →
        </Link>
      </div>
      {loading ? (
        <p role="status">Loading connected agents…</p>
      ) : !active.length ? (
        <div className="flow-surface">
          <h3>Connect your first agent</h3>
          <p>
            Give an agent scoped access to read its account and request payments
            for your approval.
          </p>
          <Link href="/connect">Create an MCP connection →</Link>
        </div>
      ) : (
        <div className="hub-agent-grid">
          {active.map((agent) => (
            <article
              className="flow-surface"
              key={`${agent.source}:${agent.id}`}
            >
              <span className="flow-eyebrow">ACTIVE CONNECTION</span>
              <h3>{agent.name}</h3>
              <p className="hub-address" title={agent.account}>
                {agent.account}
              </p>
              <p className="flow-note">
                Expires {new Date(agent.expiresAt * 1000).toLocaleString()}
              </p>
              <div className="flow-inline-actions">
                <Link
                  href={`/connect?account=${encodeURIComponent(agent.account)}`}
                >
                  Manage access
                </Link>
                <button disabled={!!busy} onClick={() => revoke(agent)}>
                  {busy === agent.id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {!!archived.length && (
        <details className="flow-disclosure">
          <summary>Expired &amp; revoked agents ({archived.length})</summary>
          {archived.map((agent) => (
            <p key={`${agent.source}:${agent.id}`}>
              <strong>{agent.name}</strong> ·{' '}
              {agent.revokedAt ? 'Revoked' : 'Expired'}
            </p>
          ))}
        </details>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
