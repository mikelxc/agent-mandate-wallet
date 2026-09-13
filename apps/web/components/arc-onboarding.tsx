'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useConnection } from 'wagmi';
import {
  ArrowRight,
  Check,
  Wallet,
  ShieldCheck,
  Badge,
  KeyRound,
  Package,
  Clipboard,
  LockKeyhole,
  Network,
} from 'lucide-react';
import Link from 'next/link';
import type { Address } from 'viem';
import { agentEnsName } from '@mandate/sdk';
import { ChainWalletSetup } from './chain-wallet-setup';
import {
  ChainWalletPicker,
  type AdditionalWalletNetwork,
} from './chain-wallet-picker';
import { AgentAccessFlow } from './agent-access-flow';
import { PurchaseTracker } from './purchase-tracker';
import { OnboardingContext } from './onboarding-context';
import styles from './onboarding.module.css';
import {
  developerPackPublicUrl,
  purchaseInstruction,
} from '../lib/merchant-purchase';
import { SpendingOverview } from './spending-overview';
import './arc-onboarding.css';

const steps = [
  {
    label: 'Connect',
    title: 'Connect your wallet.',
    copy: 'Use the wallet you already have. Your keys stay yours.',
    icon: Wallet,
  },
  {
    label: 'How it works',
    title: 'How your agent spends.',
    copy: 'You own the wallet. Your agent requests payments. You decide what gets paid.',
    icon: ShieldCheck,
  },
  {
    label: 'Name your wallet',
    title: 'Name your agent’s wallet',
    copy: 'Choose one name. We’ll create its wallet on Sepolia, register the ENS name, and put the ownership NFT in your wallet.',
    icon: Badge,
  },
  {
    label: 'Add a chain',
    title: 'Add another chain.',
    copy: 'Your named wallet starts on Sepolia. Choose another network to give your agent a wallet there, too.',
    icon: Network,
  },
  {
    label: 'Connect your agent',
    title: 'Connect your agent.',
    copy: 'Link your app to the Arc wallet you just added. It can read details and request payments; your signature stays with you.',
    icon: KeyRound,
  },
  {
    label: 'Try a purchase',
    title: 'Try your first purchase.',
    copy: 'When you’re ready, ask your agent to request the Developer Pack. You’ll review the payment before any funds move.',
    icon: Package,
  },
];
type NamedWallet = {
  name: string;
  label: string;
  account: Address;
  nftId: string;
};
export function ArcOnboarding({
  initialStep,
  alwaysSetup = false,
}: {
  initialStep?: number;
  alwaysSetup?: boolean;
}) {
  const query = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { address } = useConnection();
  const requested = query.get('setup');
  const step =
    requested && /^[1-6]$/.test(requested)
      ? Number(requested)
      : (initialStep ?? 1);
  const [acceptedFor, setAcceptedFor] = useState<string>();
  const [ownerSession, setOwnerSession] = useState('');
  const [namedWallet, setNamedWallet] = useState<NamedWallet>();
  const [arcWallet, setArcWallet] = useState<Address>();
  const [selectedNetwork, setSelectedNetwork] =
    useState<AdditionalWalletNetwork>('Arc');
  const [draftName, setDraftName] = useState('');
  const [progress, setProgress] = useState({
    identity: false,
    account: false,
    agent: false,
  });
  const [purchaseOwner, setPurchaseOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [returning, setReturning] = useState(false);
  const ownerKey = address?.toLowerCase() ?? 'visitor';
  const accepted = acceptedFor === ownerKey;
  const signedIn =
    !!address && ownerSession.toLowerCase() === address.toLowerCase();
  const activeOwner = useRef(address);
  activeOwner.current = address;
  function setStep(next: number) {
    const params = new URLSearchParams(query.toString());
    params.set('setup', String(next));
    router.push(`${pathname}?${params}`, { scroll: false });
  }
  useEffect(() => {
    if (address)
      setAcceptedFor((previous) =>
        previous === 'visitor' ? address.toLowerCase() : previous,
      );
    setOwnerSession('');
    setNamedWallet(undefined);
    setArcWallet(undefined);
    setDraftName('');
    setProgress({ identity: false, account: false, agent: false });
    setPurchaseOwner('');
    setError('');
    let cancelled = false;
    if (address)
      void fetch('/gateway/auth/session', { credentials: 'same-origin' })
        .then(async (r) => (r.ok ? r.json() : null))
        .then((s) => {
          if (!cancelled && s?.address?.toLowerCase() === address.toLowerCase())
            setOwnerSession(address);
        })
        .catch(() => {});
    const listener = (event: Event) => {
      const session = (event as CustomEvent<{ address: string } | null>).detail;
      setOwnerSession(
        session?.address?.toLowerCase() === address?.toLowerCase()
          ? address!
          : '',
      );
    };
    const failed = (event: Event) =>
      setError((event as CustomEvent<string>).detail);
    window.addEventListener('wayleave:owner-session', listener);
    window.addEventListener('wayleave:owner-auth-error', failed);
    return () => {
      cancelled = true;
      window.removeEventListener('wayleave:owner-session', listener);
      window.removeEventListener('wayleave:owner-auth-error', failed);
    };
  }, [address]);
  useEffect(() => {
    if (signedIn && (returning || (!alwaysSetup && requested === null)))
      router.replace('/spending');
  }, [returning, signedIn, router, alwaysSetup, requested]);
  async function connect() {
    setBusy(true);
    setError('');
    try {
      const { openWalletPicker, verifyConnectedOwner } =
        await import('../lib/wallet-config');
      if (address) await verifyConnectedOwner();
      else await openWalletPicker();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wallet connection failed');
    } finally {
      setBusy(false);
    }
  }
  if (!alwaysSetup && !query.has('setup'))
    return (
      <div className="agent-shell desktop-agent-pro show-on-mobile">
        <SpendingOverview
          signedIn={false}
          agents={[]}
          operations={[]}
          now={Date.now()}
          busy={busy}
          authLabel="Sign in"
          onConnect={() => {
            setReturning(true);
            void connect();
          }}
          onSetup={() => {
            setReturning(false);
            router.push('/?setup=1');
          }}
        />
        <output
          className="mobile-status arc-onboarding-status"
          aria-live="polite"
        >
          {error}
        </output>
      </div>
    );
  const complete = [
    signedIn,
    accepted,
    !!namedWallet,
    !!arcWallet,
    progress.agent,
    signedIn && purchaseOwner.toLowerCase() === ownerKey,
  ];
  const current = steps[step - 1];
  const Icon = current.icon;
  const allowed = accepted && signedIn;
  const canLink = allowed && !!namedWallet && !!arcWallet;
  return (
    <section
      className={`mobile-agent-onboarding ${styles.shell} arc-onboarding paced-onboarding`}
      data-step={step}
      aria-label="Agent wallet onboarding"
    >
      <div className="mobile-onboarding-top">
        <span className="mobile-wordmark">Test networks · Test funds only</span>
        <Link href="/spending">
          View spending <ArrowRight size={14} />
        </Link>
      </div>
      <nav className={styles.stepNav} aria-label="Onboarding steps">
        {steps.map((item, i) => (
          <button
            key={item.label}
            type="button"
            aria-label={`Go to step ${i + 1}: ${item.label}`}
            aria-current={step === i + 1 ? 'step' : undefined}
            onClick={() => setStep(i + 1)}
          >
            <span>{complete[i] ? <Check size={13} /> : `0${i + 1}`}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="mobile-stage">
        <div className="arc-step-intro">
          <span className={styles.stepSymbol} aria-hidden="true">
            <Icon />
          </span>
          <div className="mobile-copy">
            <h2>{current.title}</h2>
            <p>{current.copy}</p>
          </div>
        </div>
        {step === 4 ? (
          <aside
            className={`${styles.context} add-chain-context`}
            aria-label="Add another chain explained"
          >
            <span className={styles.eyebrow}>
              SAME OWNER · SEPARATE CHAIN WALLETS
            </span>
            <div className="chain-relationship">
              <Badge size={22} />
              <div>
                <strong>Sepolia</strong>
                <small>
                  {namedWallet?.name ?? 'Your ENS name + agent wallet'}
                </small>
              </div>
              <span>{namedWallet ? 'Verified' : 'Create first'}</span>
            </div>
            <div className="chain-add-connector">+ Add a network</div>
            <div className="chain-relationship">
              <Network size={22} />
              <div>
                <strong>Arc</strong>
                <small>Another wallet and ownership NFT</small>
              </div>
              <span>{arcWallet ? 'Verified' : 'To add'}</span>
            </div>
            <div className={styles.topicCopy}>
              <h3>More places to pay. You still own it.</h3>
              <p>
                Your owner wallet holds an NFT on each chain. Adding Arc does
                not move your Sepolia wallet or funds.
              </p>
            </div>
            <details>
              <summary>What happens to the ENS name?</summary>
              <p>
                It still resolves to your Sepolia wallet. In the next step, you
                can sign a Wayleave association to the Arc wallet. That
                association does not change ENS records.
              </p>
            </details>
          </aside>
        ) : step === 6 ? (
          <aside className={styles.context} aria-label="Your purchase progress">
            <PurchaseTracker onPurchased={setPurchaseOwner} />
          </aside>
        ) : (
          <OnboardingContext
            step={step === 2 ? 6 : step === 3 ? 2 : step === 5 ? 4 : 1}
            owner={signedIn ? address : undefined}
            account={step === 5 ? arcWallet : namedWallet?.account}
            walletName={
              namedWallet?.name ??
              (draftName ? agentEnsName(draftName) : 'Your agent wallet')
            }
            identityVerified={!!namedWallet}
            nftId={namedWallet?.nftId}
            hostName="Your agent app"
            hasCredential={progress.agent}
            onExplore={() => setStep(2)}
          />
        )}
        <div className="mobile-step-content arc-step-actions">
          {step === 1 && (
            <>
              <button
                className="mobile-primary"
                disabled={busy}
                onClick={() => (signedIn ? setStep(2) : void connect())}
              >
                {busy
                  ? 'Check your wallet…'
                  : signedIn
                    ? 'Continue to how it works'
                    : address
                      ? 'Sign in with your wallet'
                      : 'Connect wallet'}
                <ArrowRight size={17} />
              </button>
              <p className="mobile-trust">
                <LockKeyhole size={14} />
                Signing in won’t move money.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <div className="access-acknowledgement">
                <ShieldCheck size={22} />
                <h3>Your agent requests. You approve.</h3>
                <p>
                  The ownership NFT stays in your wallet. A connection lets an
                  app read details and request payments. It does not hand over
                  your signing key.
                </p>
              </div>
              <button
                className="mobile-primary"
                onClick={() => {
                  setAcceptedFor(ownerKey);
                  setStep(3);
                }}
              >
                I understand. Name my wallet <ArrowRight size={17} />
              </button>
              <p className="mobile-trust">
                This acknowledgement grants no spending permission.
              </p>
            </>
          )}
          {step === 4 && (
            <ChainWalletPicker
              value={selectedNetwork}
              onChange={setSelectedNetwork}
            />
          )}
          {step >= 3 && step <= 5 && !accepted && (
            <div className="setup-prerequisite">
              <p>
                First, understand what your agent can do and what stays in your
                control.
              </p>
              <button className="mobile-primary" onClick={() => setStep(2)}>
                Review how your agent spends <ArrowRight size={16} />
              </button>
            </div>
          )}
          {step >= 3 && step <= 5 && accepted && !signedIn && (
            <div className="setup-prerequisite">
              <p>
                Connect and verify the wallet that will own your agent wallets.
              </p>
              <button
                className="mobile-primary"
                disabled={busy}
                onClick={() => void connect()}
              >
                {busy ? 'Check your wallet…' : 'Connect your wallet'}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {allowed && (
            <div hidden={step !== 3}>
              <ChainWalletSetup
                network="Sepolia"
                onAccount={() => {}}
                onLabelChange={setDraftName}
                onIdentity={(identity) => {
                  if (activeOwner.current === address) setNamedWallet(identity);
                }}
              />
              <p className="mobile-trust">
                One setup transaction creates the wallet, its ownership NFT and
                ENS name. Completion waits for the receipt and name resolution.
              </p>
              {namedWallet && (
                <button className="mobile-primary" onClick={() => setStep(4)}>
                  Continue: add another chain <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
          {allowed && !!namedWallet && (
            <div hidden={step !== 4}>
              <ChainWalletSetup
                key={namedWallet.account}
                network={selectedNetwork}
                initialLabel={namedWallet.label}
                onAccount={(account) => {
                  if (activeOwner.current === address) setArcWallet(account);
                }}
              />
              <p className="mobile-trust">
                Arc is used for this app’s USDC payment route. You’ll confirm a
                separate creation transaction on Arc.
              </p>
              {arcWallet && (
                <button className="mobile-primary" onClick={() => setStep(5)}>
                  Continue to agent connection <ArrowRight size={16} />
                </button>
              )}
              <Link className="mobile-link" href="/spending">
                I’ll add another chain later <ArrowRight size={14} />
              </Link>
            </div>
          )}
          {allowed && step === 4 && !namedWallet && (
            <>
              <p>Create or verify your named Sepolia wallet first.</p>
              <button className="mobile-primary" onClick={() => setStep(3)}>
                Name your agent’s wallet <ArrowRight size={16} />
              </button>
            </>
          )}
          {allowed && step === 5 && !canLink && (
            <>
              <p>
                This connection uses an Arc wallet. Finish naming your wallet
                and adding Arc first.
              </p>
              <button
                className="mobile-primary"
                onClick={() => setStep(namedWallet ? 4 : 3)}
              >
                {namedWallet ? 'Add Arc' : 'Name your agent’s wallet'}
                <ArrowRight size={16} />
              </button>
            </>
          )}
          {canLink && (
            <div hidden={step !== 5} className="arc-identity-form">
              <AgentAccessFlow
                key={`${address}:${namedWallet.account}:${arcWallet}`}
                initialName={namedWallet.name}
                initialAccount={arcWallet}
                onProgress={setProgress}
              />
              {progress.agent && (
                <button className="mobile-primary" onClick={() => setStep(6)}>
                  Continue: try a purchase <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
          {step === 6 && (
            <>
              <span className="setup-optional">OPTIONAL · AFTER SETUP</span>
              <div className="first-purchase-instruction">
                <span>ASK YOUR AGENT</span>
                <p>{purchaseInstruction}</p>
              </div>
              <button
                className="mobile-primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(purchaseInstruction);
                    setCopied(true);
                  } catch {
                    setError(
                      'Copy the instruction above. Clipboard access is unavailable.',
                    );
                  }
                }}
              >
                {copied ? 'Instruction copied' : 'Copy purchase instruction'}
                {copied ? <Check size={16} /> : <Clipboard size={16} />}
              </button>
              <Link
                className="first-purchase-store"
                href="/spending"
              >
                Open Spending <ArrowRight size={14} />
              </Link>
              <p className="mobile-trust">
                Your agent visits {developerPackPublicUrl}. A purchase is
                complete only after its payment and delivery are verified.
              </p>
              {!progress.agent && (
                <button className="mobile-link" onClick={() => setStep(5)}>
                  Finish connecting your agent first <ArrowRight size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <output
        className="mobile-status arc-onboarding-status"
        aria-live="polite"
      >
        {error}
      </output>
    </section>
  );
}
