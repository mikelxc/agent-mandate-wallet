'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useConnection, usePublicClient } from 'wagmi';
import {
  ArrowRight,
  Check,
  Wallet,
  ShieldCheck,
  Fingerprint,
  KeyRound,
  Package,
  Clipboard,
  LockKeyhole,
} from 'lucide-react';
import Link from 'next/link';
import { PortableIdentityPanel } from './portable-identity';
import { PurchaseTracker } from './purchase-tracker';
import { OnboardingContext } from './onboarding-context';
import styles from './onboarding.module.css';
import {
  developerPackPublicUrl,
  purchaseInstruction,
} from '../lib/merchant-purchase';
import { SpendingOverview } from './spending-overview';
import './arc-onboarding.css';
import { arcTestnet, sepolia } from 'viem/chains';
import { isAddress, type Address } from 'viem';
import { kernelAccountFactoryAbi, sepoliaDeployment } from '@mandate/sdk';

const labels = [
  'Connect',
  'ENS identity',
  'Arc wallet',
  'Connect agent',
  'First purchase',
];
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
  const arcClient = usePublicClient({ chainId: arcTestnet.id });
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const { address } = useConnection();
  const requestedStep = query.get('setup');
  const step =
    requestedStep && /^[1-5]$/.test(requestedStep)
      ? Number(requestedStep)
      : (initialStep ?? 1);
  function setStep(next: number) {
    const params = new URLSearchParams(query.toString());
    params.set('setup', String(Math.max(1, Math.min(5, next))));
    router.push(`${pathname}?${params}${window.location.hash}`, {
      scroll: false,
    });
  }
  useEffect(() => {
    if (alwaysSetup || !address || !query.has('setup')) return;
    let cancelled = false;
    const leaveSetup = () => {
      if (cancelled) return;
      const params = new URLSearchParams(query.toString());
      params.delete('setup');
      router.replace(
        `/payments${params.size ? `?${params}` : ''}${window.location.hash}`,
        { scroll: false },
      );
    };
    // Each registry is checked independently. Failed RPC reads are not proof of ownership.
    if (sepoliaClient)
      void sepoliaClient
        .readContract({
          address: sepoliaDeployment.registry,
          abi: kernelAccountFactoryAbi,
          functionName: 'balanceOf',
          args: [address],
        })
        .then((balance) => {
          if (balance > 0n) leaveSetup();
        })
        .catch(() => {});
    if (arcClient)
      void fetch('/gateway/crosschain/config')
        .then((r) => (r.ok ? r.json() : null))
        .then(async (config) => {
          if (
            cancelled ||
            !config?.configured ||
            config.chainId !== arcTestnet.id ||
            !isAddress(config.registry)
          )
            return;
          const balance = await arcClient.readContract({
            address: config.registry as Address,
            abi: kernelAccountFactoryAbi,
            functionName: 'balanceOf',
            args: [address],
          });
          if (balance > 0n) leaveSetup();
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, alwaysSetup, arcClient, sepoliaClient, pathname, query]);
  const [progress, setProgress] = useState({
    identity: false,
    account: false,
    agent: false,
  });
  const [purchaseOwner, setPurchaseOwner] = useState('');
  const [ownerSession, setOwnerSession] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setProgress({ identity: false, account: false, agent: false });
    setPurchaseOwner('');
    setOwnerSession('');
    let cancelled = false;
    if (address)
      fetch('/gateway/auth/session', { credentials: 'same-origin' })
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
    window.addEventListener('wayleave:owner-auth-error', failed);
    window.addEventListener('wayleave:owner-session', listener);
    return () => {
      cancelled = true;
      window.removeEventListener('wayleave:owner-session', listener);
      window.removeEventListener('wayleave:owner-auth-error', failed);
    };
  }, [address]);
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
  const setup = alwaysSetup || query.has('setup');
  if (!setup)
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
            router.push('/?setup=1');
            void connect();
          }}
          onSetup={() => router.push('/wallets/setup')}
        />
      </div>
    );
  const complete = [
    !!address && ownerSession === address,
    progress.identity,
    progress.account,
    progress.agent,
    !!address && purchaseOwner === address && ownerSession === address,
  ];
  const StageIcon = [Wallet, Fingerprint, Wallet, KeyRound, Package][step - 1];
  return (
    <section
      className={`mobile-agent-onboarding ${styles.shell} arc-onboarding`}
      data-step={step}
      aria-label="Arc onboarding"
    >
      <div className="mobile-onboarding-top">
        <span className="mobile-wordmark">Arc Testnet · test funds only</span>
        <Link href="/payments">
          View payments <ArrowRight size={14} />
        </Link>
      </div>
      <nav className={styles.stepNav} aria-label="Onboarding steps">
        {labels.map((label, i) => (
          <button
            key={label}
            aria-label={`Go to step ${i + 1}: ${label}`}
            aria-current={step === i + 1 ? 'step' : undefined}
            onClick={() => setStep(i + 1)}
          >
            <span>{complete[i] ? <Check size={13} /> : `0${i + 1}`}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="mobile-stage">
        <div className="mobile-step-content">
          <span className={styles.stepSymbol} aria-hidden="true">
            <StageIcon />
          </span>
          {step === 1 && (
            <>
              <div className="mobile-copy">
                <h2>Connect your wallet.</h2>
                <p>
                  Use the wallet you already have. Your agent requests payments;
                  you approve the spending.
                </p>
              </div>
              <button
                className="mobile-primary"
                disabled={busy}
                onClick={() => (complete[0] ? setStep(2) : void connect())}
              >
                {busy
                  ? 'Opening wallet…'
                  : complete[0]
                    ? 'Continue to ENS identity'
                    : address
                      ? 'Sign in with your wallet'
                      : 'Connect wallet'}
                <ArrowRight size={17} />
              </button>
              <p className="mobile-trust">
                <LockKeyhole size={14} />
                Signing in won’t move money.
              </p>
              <details className="connection-details">
                <summary>Networks used during setup</summary>
                <p>
                  ENS registration and sign-in use Sepolia. Your payment wallet
                  is created on Arc Testnet.
                </p>
              </details>
            </>
          )}
          {(step === 3 || step === 4) && (
            <div className="mobile-copy">
              <h2>
                {step === 3 ? 'Create your Arc wallet.' : 'Connect your agent.'}
              </h2>
              <p>
                {step === 3
                  ? 'Create a wallet you own, then link it to your ENS identity.'
                  : 'Give your agent permission to read and request payments. You keep the signing authority.'}
              </p>
            </div>
          )}
          <div className="arc-identity-form" hidden={step < 2 || step > 4}>
            <PortableIdentityPanel
              key={address ?? 'disconnected'}
              stage={step === 3 ? 'account' : step === 4 ? 'agent' : 'identity'}
              onProgress={setProgress}
            />
          </div>
          {step === 5 && (
            <>
              <div className="mobile-copy">
                <h2>Make your first purchase.</h2>
                <p>
                  Try a 0.10 test-USDC Developer Pack purchase. Review its
                  request here, then let it read what it bought.
                </p>
              </div>
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
                href="/payments?firstPurchase=1"
              >
                Continue to Payments <ArrowRight size={14} />
              </Link>
              <p className="mobile-trust">
                Your agent visits {developerPackPublicUrl}. Your payment stays
                in Wayleave.
              </p>
              {!progress.account && (
                <p className="mobile-trust">
                  Link your Arc wallet and create its bearer token before
                  requesting a purchase.
                </p>
              )}
            </>
          )}
          {step > 1 && step < 5 && (
            <button
              className="mobile-primary"
              onClick={() =>
                step === 4 &&
                progress.identity &&
                progress.account &&
                progress.agent
                  ? router.push('/payments?firstPurchase=1')
                  : setStep(step + 1)
              }
            >
              {step === 4 &&
              progress.identity &&
              progress.account &&
              progress.agent
                ? 'Finish setup & try a purchase'
                : complete[step - 1]
                  ? 'Continue'
                  : 'Explore next step'}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
        {step === 5 ? (
          <aside className={styles.context} aria-label="Your purchase progress">
            <PurchaseTracker onPurchased={setPurchaseOwner} />
          </aside>
        ) : (
          <OnboardingContext
            step={step === 3 ? 2 : step === 2 ? 6 : step}
            owner={address}
            walletName="Your Arc wallet"
            identityVerified={progress.identity}
            hostName="Your agent"
            hasCredential={progress.agent}
            onExplore={() => setStep(2)}
          />
        )}
      </div>
      <output
        className="mobile-status arc-onboarding-status"
        aria-live="polite"
      >
        {error ||
          (complete[0]
            ? 'Owner verified. Payment approvals remain separate.'
            : '')}
      </output>
    </section>
  );
}
