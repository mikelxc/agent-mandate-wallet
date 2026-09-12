'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ConnectionGuide } from './connection-guide';
import { WayleaveMark } from './wayleave-mark';
import { ArrowRight, Pause, Play, Check } from 'lucide-react';
import type { AgentConnection, Operation } from '@mandate/protocol';

type Payment = Operation & {
  execution?: { success: boolean; transactionHash: string };
};
export function SpendingOverview({
  signedIn,
  agents,
  operations,
  now,
  busy,
  authLabel,
  onConnect,
  onSetup,
}: {
  signedIn: boolean;
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
            Each agent gets a real wallet, owned by an NFT you hold in yours.
            Agents spend from your balance. You approve the payments.
          </p>
          <button className="primary" disabled={busy} onClick={onConnect}>
            {authLabel}
            <ArrowRight size={17} />
          </button>
          <span className="entry-note">
            Your keys stay yours. Your funds stay together.
          </span>
          <Link href="#connect-agent" className="entry-help">
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
            <h2>A wallet inside your wallet.</h2>
            <p>
              Each NFT in your wallet controls an agent wallet with its own
              address. You hold the ownership; your agent gets a connection.
            </p>
          </div>
        </div>
        <ConnectionGuide />
      </section>
    );
  return (
    <section className="payments-heading">
      <div>
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
    ens: 'research.wayleave.eth',
    nft: '101',
    address: '0x1111111111111111111111111111111111111101',
    task: 'A paper worth reading.',
    amount: '$4.00',
    recipient: 'Research library',
    shape: 'flower',
  },
  {
    name: 'Travel agent',
    ens: 'travel.wayleave.eth',
    nft: '102',
    address: '0x2222222222222222222222222222222222222202',
    task: 'The next stop, sorted.',
    amount: '$12.00',
    recipient: 'Travel service',
    shape: 'arch',
  },
  {
    name: 'Coding agent',
    ens: 'coding.wayleave.eth',
    nft: '103',
    address: '0x3333333333333333333333333333333333333303',
    task: 'A little more compute.',
    amount: '$2.50',
    recipient: 'Compute provider',
    shape: 'steps',
  },
];
function WalletScene() {
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPlaying(!preference.matches);
    const update = () => {
      if (preference.matches) setPlaying(false);
    };
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (phase === 3) {
        setSelected((current) => (current + 1) % sceneAgents.length);
        setPhase(0);
      } else setPhase((current) => current + 1);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [playing, phase, selected]);
  const agent = sceneAgents[selected];
  const phases = [
    'Request received',
    'Owner approves · demo',
    'Spending from your wallet',
    'Transaction sent · demo',
  ];
  const selectAgent = (index: number) => {
    setSelected(index);
    setPhase(0);
    setPlaying(false);
  };
  return (
    <div
      className="wallet-scene"
      data-phase={phase}
      data-playing={playing}
      aria-label="Your wallet holds ownership NFTs, each controlling a real agent wallet"
    >
      <div className="scene-player">
        <span className="scene-caption">YOUR WALLET. YOUR AGENTS.</span>
        <button
          aria-label={playing ? 'Pause wallet demo' : 'Play wallet demo'}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <div className="scene-source">
        <WayleaveMark width={38} height={38} />
        <div>
          <strong>Your wallet</strong>
          <span>Your funds + your ownership NFTs.</span>
          <span className="scene-parent-balance">
            $250.00 USDC · example balance
          </span>
        </div>
        <span className="source-dot" />
      </div>
      <div className="scene-branches" aria-hidden="true">
        <svg viewBox="0 0 400 68">
          <path d="M200 0v22M64 68V42Q64 22 84 22h232q20 0 20 20v26M200 22v46" />
          <path
            className="scene-funding-flow"
            d={
              selected === 0
                ? 'M200 0v22H84Q64 22 64 42v26'
                : selected === 1
                  ? 'M200 0v68'
                  : 'M200 0v22h116q20 0 20 20v26'
            }
          />
        </svg>
      </div>
      <div className="scene-owned-wallets">
        <span className="scene-ownership-label">NFTs held in your wallet</span>
        <div className="scene-agents">
          {sceneAgents.map((item, index) => (
            <button
              key={item.name}
              aria-pressed={selected === index}
              onClick={() => selectAgent(index)}
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
              <span className="scene-nft-label">
                {item.ens}
                <b>NFT #{item.nft}</b>
              </span>
              <span className="scene-inner-wallet" title={item.address}>
                Resolves to
                <br />
                {item.address.slice(0, 6)}…{item.address.slice(-4)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="scene-ownership-note">
        Agents spend from your wallet. No separate top-ups.
      </p>
      <div
        className="scene-request"
        key={selected}
        aria-live={playing ? 'off' : 'polite'}
      >
        <div className="scene-request-heading">
          <span>{phase === 3 ? 'EXAMPLE TRANSACTION' : 'EXAMPLE REQUEST'}</span>
          <span className="scene-status">{phases[phase]}</span>
        </div>
        <h2>{agent.task}</h2>
        <div className="scene-amount">
          <strong>{agent.amount}</strong>
          <span>USDC · {agent.recipient}</span>
        </div>
        <div className="scene-receipt">
          <span>
            {phase === 0
              ? `From ${agent.name.toLowerCase()} → you`
              : phase === 1
                ? 'Your approval is required before spending'
                : phase === 2
                  ? 'Your wallet → agent wallet → recipient'
                  : `Sent to ${agent.recipient.toLowerCase()}`}
          </span>
          {phase === 3 ? <Check size={13} /> : <ArrowRight size={13} />}
        </div>
      </div>
      <div
        className="scene-transfer"
        aria-label="Payment route from your wallet through the agent wallet to the recipient"
      >
        <span>Your wallet</span>
        <i aria-hidden="true" />
        <span>Agent wallet</span>
        <i aria-hidden="true" />
        <span>{agent.recipient}</span>
      </div>
      <div className="scene-timeline" aria-label="Demo payment stages">
        {['Request', 'Approve', 'Spend', 'Sent'].map((label, index) => (
          <button
            key={label}
            aria-label={`Show ${label.toLowerCase()} stage`}
            aria-current={phase === index ? 'step' : undefined}
            onClick={() => {
              setPhase(index);
              setPlaying(false);
            }}
          >
            <span />
            {label}
          </button>
        ))}
      </div>
      <p className="scene-footnote">
        Demo · See how a payment works.
      </p>
    </div>
  );
}
