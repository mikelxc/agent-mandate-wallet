'use client';

import Link from 'next/link';
import { ArrowRight, Wallet } from 'lucide-react';
import type { AgentConnection, Operation } from '@mandate/protocol';

type Payment = Operation & {
  execution?: { success: boolean; transactionHash: string };
};
export function SpendingOverview({
  signedIn,
  address,
  agents,
  operations,
  now,
  busy,
  authLabel,
  onConnect,
  onSetup,
}: {
  signedIn: boolean;
  address?: string;
  agents: AgentConnection[];
  operations: Payment[];
  now: number;
  busy: boolean;
  authLabel: string;
  onConnect: () => void;
  onSetup: () => void;
}) {
  const active = agents.filter(
    (agent) => !agent.revokedAt && agent.expiresAt * 1000 > now,
  );
  const pending = operations.filter(
    (op) =>
      op.status === 'approval_required' &&
      !op.execution &&
      op.intent.expiresAt * 1000 > now,
  );
  if (!signedIn)
    return (
      <section className="wallet-entry" aria-labelledby="wallet-entry-title">
        <span className="entry-icon">
          <Wallet size={26} strokeWidth={1.4} />
        </span>
        <h1 id="wallet-entry-title">Give your agent a wallet you control.</h1>
        <p>
          Keep its ownership NFT in your wallet. Your agent requests payments
          from your balance; you approve what gets spent.
        </p>
        <button className="primary" disabled={busy} onClick={onConnect}>
          {authLabel}
          <ArrowRight size={16} />
        </button>
        <span className="entry-note">
          Scan with your mobile wallet or use a browser wallet.
        </span>
        <Link href="/connect" className="entry-help">
          Connecting from your agent?
        </Link>
      </section>
    );
  return (
    <section className="payments-heading">
      <div>
        <span className="owner-caption">
          {address?.slice(0, 6)}…{address?.slice(-4)}
        </span>
        <h1>Payments</h1>
        <p>
          {pending.length
            ? `${pending.length} waiting for your approval`
            : 'No payments waiting for approval'}
        </p>
      </div>
      <button className="secondary" onClick={onSetup}>
        {active.length ? 'Add agent' : 'Connect an agent'}
        <ArrowRight size={16} />
      </button>
    </section>
  );
}
