'use client';

import Link from 'next/link';
import { useState } from 'react';
import { WayleaveMark } from './wayleave-mark';
import { ArrowRight } from 'lucide-react';
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
        <div className="entry-copy">
          <span className="entry-eyebrow">
            A little freedom. A clear boundary.
          </span>
          <h1 id="wallet-entry-title">
            Let your agents
            <br />
            do their thing.
          </h1>
          <p>
            One wallet for your money. A little room for your agents to spend.
            You approve the payments and see it all here.
          </p>
          <button className="primary" disabled={busy} onClick={onConnect}>
            {authLabel}
            <ArrowRight size={17} />
          </button>
          <span className="entry-note">
            Your keys stay yours. Your funds stay together.
          </span>
          <Link href="/connect" className="entry-help">
            Start from your agent <ArrowRight size={14} />
          </Link>
        </div>
        <WalletScene />
        <div className="entry-principles">
          <div>
            <span>01</span>
            <h2>One source of funds.</h2>
            <p>Agents spend from your wallet. No juggling separate balances.</p>
          </div>
          <div>
            <span>02</span>
            <h2>A say in every payment.</h2>
            <p>See the amount and recipient before you approve.</p>
          </div>
          <div>
            <span>03</span>
            <h2>Always yours.</h2>
            <p>
              Own each agent wallet as an NFT. Revoke its connection whenever
              you need.
            </p>
          </div>
        </div>
      </section>
    );
  return (
    <section className="payments-heading">
      <div>
        <span className="owner-caption">
          {address?.slice(0, 6)}…{address?.slice(-4)}
        </span>
        <h1>Your spending, together.</h1>
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

const sceneAgents = [
  {
    name: 'Research agent',
    task: 'A paper worth reading.',
    amount: '$4.00',
    recipient: 'Research library',
    shape: 'flower',
  },
  {
    name: 'Travel agent',
    task: 'The next stop, sorted.',
    amount: '$12.00',
    recipient: 'Travel service',
    shape: 'arch',
  },
  {
    name: 'Coding agent',
    task: 'A little more compute.',
    amount: '$2.50',
    recipient: 'Compute provider',
    shape: 'steps',
  },
];
function WalletScene() {
  const [selected, setSelected] = useState(0);
  const agent = sceneAgents[selected];
  return (
    <div
      className="wallet-scene"
      aria-label="Illustration of agents spending from one wallet"
    >
      <span className="scene-caption">ONE WALLET. YOUR AGENTS.</span>
      <div className="scene-source">
        <WayleaveMark width={38} height={38} />
        <div>
          <strong>Your wallet</strong>
          <span>The money stays here.</span>
        </div>
        <span className="source-dot" />
      </div>
      <div className="scene-branches" aria-hidden="true">
        <svg viewBox="0 0 400 68">
          <path d="M200 0v22M64 68V42Q64 22 84 22h232q20 0 20 20v26M200 22v46" />
        </svg>
      </div>
      <div className="scene-agents">
        {sceneAgents.map((item, index) => (
          <button
            key={item.name}
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            <span
              className={`agent-sculpture ${item.shape}`}
              aria-hidden="true"
            >
              <i />
              <i />
              <i />
            </span>
            <span>{item.name}</span>
          </button>
        ))}
      </div>
      <div className="scene-request" key={selected} aria-live="polite">
        <div className="scene-request-heading">
          <span>EXAMPLE REQUEST</span>
          <span className="scene-status">Your approval needed</span>
        </div>
        <h2>{agent.task}</h2>
        <div className="scene-amount">
          <strong>{agent.amount}</strong>
          <span>USDC · {agent.recipient}</span>
        </div>
        <div className="scene-receipt">
          <span>Requested by {agent.name.toLowerCase()}</span>
          <span>↗</span>
        </div>
      </div>
      <p className="scene-footnote">
        A preview of how it works. Choose an agent to explore.
      </p>
    </div>
  );
}
