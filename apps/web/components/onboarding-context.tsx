'use client';

import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Badge,
  Fingerprint,
  Bot,
  Check,
  Circle,
  KeyRound,
  LockKeyhole,
  Pause,
  Play,
  ReceiptText,
  ShieldCheck,
  Store,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import styles from './onboarding.module.css';

function Symbol({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className={styles.symbol}>
      <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
    </span>
  );
}

function Relationship({
  label,
  moving = false,
}: {
  label: string;
  moving?: boolean;
}) {
  return (
    <div className={`${styles.relationship} ${moving ? styles.moving : ''}`}>
      <span>{label}</span>
      <ArrowDown size={16} aria-hidden="true" />
    </div>
  );
}

function WalletOwnership({
  owner,
  walletName,
  account,
  nftId,
}: {
  owner?: string;
  walletName: string;
  account?: string;
  nftId?: string;
}) {
  return (
    <div className={styles.ownership}>
      <div className={styles.ownerNode}>
        <div className={styles.nodeTitle}>
          <Symbol icon={Wallet} />
          <div>
            <strong>Your wallet</strong>
            <small>
              {owner
                ? `${owner.slice(0, 6)}…${owner.slice(-4)}`
                : 'Your funds stay here'}
            </small>
          </div>
        </div>
        <div className={styles.nft}>
          <Badge size={18} strokeWidth={1.5} />
          <div>
            <strong>Ownership NFT{nftId ? ` #${nftId}` : ''}</strong>
            <small>
              {account
                ? 'Controls this agent wallet'
                : 'Held in your wallet after creation'}
            </small>
          </div>
        </div>
      </div>
      <Relationship label="owns" />
      <div className={styles.agentNode}>
        <Symbol icon={Bot} />
        <div>
          <strong>{walletName}</strong>
          <small>
            {account
              ? `${account.slice(0, 6)}…${account.slice(-4)}`
              : 'Its own address. Your control.'}
          </small>
        </div>
      </div>
    </div>
  );
}

const topics = ['Ownership', 'Access', 'Payments'] as const;
const paymentStages = [
  {
    label: 'Request',
    title: 'Your agent asks.',
    detail:
      'A request arrives with the amount and recipient. Nothing has been paid.',
  },
  {
    label: 'Approval',
    title: 'You decide.',
    detail:
      'Review the exact amount and recipient, then approve in your wallet.',
  },
  {
    label: 'Payment',
    title: 'Your funds take one path.',
    detail:
      'The approved payment draws from your balance through the agent wallet.',
  },
  {
    label: 'Receipt',
    title: 'Follow the outcome.',
    detail:
      'A confirmed onchain receipt records the payment. Service delivery is separate.',
  },
];

function AccessWalkthrough() {
  const [topic, setTopic] = useState(0);
  const [payment, setPayment] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => setPlaying(false);
    const hide = () => {
      if (document.hidden) stop();
    };
    preference.addEventListener('change', stop);
    document.addEventListener('visibilitychange', hide);
    return () => {
      preference.removeEventListener('change', stop);
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (payment === paymentStages.length - 1) setPlaying(false);
      else setPayment(payment + 1);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [playing, payment]);

  return (
    <div className={styles.walkthrough}>
      <fieldset className={styles.topicNav} aria-label="How Wayleave works">
        {topics.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={topic === index}
            onClick={() => {
              setTopic(index);
              setPlaying(false);
            }}
          >
            {label}
          </button>
        ))}
      </fieldset>
      <div className={styles.topicContent}>
        {topic === 0 && (
          <>
            <WalletOwnership walletName="Agent wallet" />
            <div className={styles.topicCopy}>
              <h3>You own the wallet your agent uses.</h3>
              <p>
                The NFT in your wallet records that ownership. The agent wallet
                has its own address; the NFT doesn’t hold your funds.
              </p>
            </div>
          </>
        )}
        {topic === 1 && (
          <>
            <div className={styles.accessDiagram}>
              <div className={styles.agentNode}>
                <Symbol icon={Bot} />
                <div>
                  <strong>Your agent app</strong>
                  <small>Codex, Claude or Cursor</small>
                </div>
              </div>
              <Relationship label="scoped connection" />
              <div className={styles.ownerNode}>
                <div className={styles.nodeTitle}>
                  <Symbol icon={KeyRound} />
                  <div>
                    <strong>Read & request</strong>
                    <small>Connection expires after 24 hours</small>
                  </div>
                </div>
                <div className={styles.permissionLine}>
                  <Check size={15} /> Read wallet details
                </div>
                <div className={styles.permissionLine}>
                  <Check size={15} /> Request a payment
                </div>
                <div className={styles.permissionLine}>
                  <LockKeyhole size={15} /> Your signature still required
                </div>
              </div>
            </div>
            <div className={styles.topicCopy}>
              <h3>Access is yours to give and remove.</h3>
              <p>
                A connection links an app to your agent wallet. It never gives
                the app your signing key or ownership.
              </p>
            </div>
          </>
        )}
        {topic === 2 && (
          <>
            <div className={styles.paymentHeading}>
              <span>Example payment · $12</span>
              <button
                type="button"
                aria-label={
                  playing
                    ? 'Pause payment walkthrough'
                    : 'Play payment walkthrough'
                }
                onClick={() => {
                  if (playing) setPlaying(false);
                  else {
                    if (payment === 3) setPayment(0);
                    setPlaying(true);
                  }
                }}
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
                {playing ? 'Pause' : 'Play'}
              </button>
            </div>
            <div className={styles.paymentDiagram} data-payment-stage={payment}>
              <div
                className={`${styles.agentNode} ${payment === 1 ? styles.highlight : ''}`}
              >
                <Symbol icon={Wallet} />
                <div>
                  <strong>Your wallet</strong>
                  <small>
                    {payment < 2
                      ? 'Approval required'
                      : 'Exact payment approved · Example'}
                  </small>
                </div>
              </div>
              <Relationship
                label={
                  payment < 2
                    ? 'funds stay here until approval'
                    : 'approved funds'
                }
                moving={payment === 2}
              />
              <div
                className={`${styles.agentNode} ${payment === 0 ? styles.highlight : ''}`}
              >
                <Symbol icon={Bot} />
                <div>
                  <strong>Agent wallet</strong>
                  <small>
                    {payment === 0
                      ? 'Requests $12 for a data service'
                      : 'Routes the payment from your balance'}
                  </small>
                </div>
              </div>
              <Relationship
                label={payment === 3 ? 'payment recorded' : 'to the recipient'}
                moving={payment === 2}
              />
              <div
                className={`${styles.agentNode} ${payment === 3 ? styles.highlight : ''}`}
              >
                <Symbol icon={payment === 3 ? ReceiptText : Store} />
                <div>
                  <strong>Data provider</strong>
                  <small>
                    {payment === 3
                      ? 'Example receipt · No real transaction'
                      : '$12 · No funds move in this walkthrough'}
                  </small>
                </div>
              </div>
            </div>
            <fieldset
              className={styles.paymentStages}
              aria-label="Payment walkthrough stages"
            >
              {paymentStages.map((item, i) => (
                <button
                  type="button"
                  key={item.label}
                  aria-current={payment === i ? 'step' : undefined}
                  onClick={() => {
                    setPlaying(false);
                    setPayment(i);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </fieldset>
            <div
              className={styles.topicCopy}
              aria-live={playing ? 'off' : 'polite'}
            >
              <h3>{paymentStages[payment].title}</h3>
              <p>{paymentStages[payment].detail}</p>
            </div>
          </>
        )}
      </div>
      {topic < 2 && (
        <button
          className={styles.textAction}
          type="button"
          onClick={() => setTopic(topic + 1)}
        >
          Next: {topics[topic + 1].toLowerCase()} <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}

export function OnboardingContext({
  step,
  owner,
  account,
  walletName,
  identityVerified,
  nftId,
  hostName,
  hasCredential,
  purchaseComplete = false,
  onExplore,
}: {
  step: number;
  owner?: string;
  account?: string;
  walletName: string;
  identityVerified: boolean;
  nftId?: string;
  hostName: string;
  hasCredential: boolean;
  purchaseComplete?: boolean;
  onExplore: () => void;
}) {
  return (
    <aside className={styles.context} aria-label="Your agent wallet explained">
      {step === 1 && (
        <div className={styles.intro}>
          <div className={styles.introSymbols} aria-hidden="true">
            <Symbol icon={Wallet} />
            <span />
            <Symbol icon={Bot} />
          </div>
          <h3>
            Your keys stay yours.
            <br />
            Your funds stay together.
          </h3>
          <p>
            Give your agents a wallet you own. They request payments; you
            approve the spending.
          </p>
          <div className={styles.introItems}>
            <div>
              <Badge size={18} />
              <span>A wallet owned by you</span>
            </div>
            <div>
              <KeyRound size={18} />
              <span>Separate access for each app</span>
            </div>
            <div>
              <ShieldCheck size={18} />
              <span>Your approval for every payment</span>
            </div>
          </div>
          <button
            type="button"
            className={styles.textAction}
            onClick={onExplore}
          >
            See how it works <ArrowRight size={15} />
          </button>
        </div>
      )}
      {step === 6 && <AccessWalkthrough />}
      {step === 2 && (
        <div className={styles.identityContext}>
          <span className={styles.eyebrow}>
            {account ? 'YOUR AGENT WALLET' : 'YOUR WALLET, TAKING SHAPE'}
          </span>
          <WalletOwnership
            owner={owner}
            account={account}
            walletName={walletName}
            nftId={nftId}
          />
          <p className={styles.contextNote}>
            {account
              ? identityVerified
                ? 'Name and address verified against the registry and resolver.'
                : 'Wallet selected. Name verification is still required.'
              : 'Name preview · Your wallet is created after you confirm the setup transaction.'}
          </p>
        </div>
      )}
      {step === 3 && (
        <div className={styles.identityContext}>
          <span className={styles.eyebrow}>A NAME. YOUR CONTROL.</span>
          <div className={styles.agentNode}>
            <Symbol icon={Fingerprint} />
            <div>
              <strong>Your ENS name</strong>
              <small>
                {identityVerified
                  ? 'Ownership verified'
                  : 'Verified with the wallet that controls it'}
              </small>
            </div>
          </div>
          <Relationship label="links to" />
          <div className={styles.agentNode}>
            <Symbol icon={Wallet} />
            <div>
              <strong>Your Arc wallet</strong>
              <small>You’ll link its address in the next step</small>
            </div>
          </div>
          <p className={styles.contextNote}>
            Verifying your name proves it’s yours. It doesn’t give an agent
            permission to spend.
          </p>
        </div>
      )}
      {step === 4 && (
        <div className={styles.connectionContext}>
          <span className={styles.eyebrow}>ONE CONNECTION FOR THIS APP</span>
          <div className={styles.agentNode}>
            <Symbol icon={Bot} />
            <div>
              <strong>{hostName}</strong>
              <small>Your chosen agent client</small>
            </div>
          </div>
          <Relationship
            label={
              hasCredential
                ? 'connection ready to install'
                : 'create a scoped connection'
            }
          />
          <div className={styles.agentNode}>
            <Symbol icon={Wallet} />
            <div>
              <strong>{account ? walletName : 'Your agent wallet'}</strong>
              <small>
                {account
                  ? `${account.slice(0, 6)}…${account.slice(-4)}`
                  : 'Create your agent wallet first'}
              </small>
            </div>
          </div>
          <div className={styles.topicCopy}>
            <h3>Requests come here. You decide.</h3>
            <p>
              Read wallet details and request payments for the session length
              you choose. Revoke the connection at any time.
            </p>
          </div>
          <div className={styles.installNote}>
            <LockKeyhole size={16} />
            <span>Keep your connection configuration private.</span>
          </div>
        </div>
      )}
      {step === 5 && (
        <div className={styles.nextContext}>
          <span className={styles.eyebrow}>YOUR SETUP</span>
          <ul className={styles.checklist}>
            {[
              { done: !!owner, label: 'Wallet ownership verified' },
              { done: !!account, label: 'Agent wallet selected' },
              { done: hasCredential, label: `${hostName} connection created` },
              { done: purchaseComplete, label: 'Developer Pack retrieved' },
            ].map((item) => (
              <li key={item.label}>
                {item.done ? <Check size={17} /> : <Circle size={17} />}
                <span>{item.label}</span>
                <small>{item.done ? 'Done' : 'To do'}</small>
              </li>
            ))}
          </ul>
          <div className={styles.promptCard}>
            <Symbol icon={Bot} />
            <strong>Finish with a real purchase.</strong>
            <p>
              “Buy the Wayleave Developer Pack, then explain its architecture.”
            </p>
            <small>
              Use a named connection linked to your Arc account in {hostName}.
              Your agent returns a payment approval link; files unlock after
              destination settlement.
            </small>
          </div>
          <p className={styles.contextNote}>
            Creating a connection doesn’t confirm that your app has installed
            it.
          </p>
        </div>
      )}
    </aside>
  );
}
