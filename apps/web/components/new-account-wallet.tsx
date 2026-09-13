'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useConnection } from 'wagmi';
import { ArrowDown, ArrowLeft, Check, KeyRound, Wallet } from 'lucide-react';
import { sepolia } from 'viem/chains';
import { ChainWalletSetup } from './chain-wallet-setup';

export function NewAccountWallet() {
  const { address } = useConnection();
  return <AccountWalletPage key={address ?? 'visitor'} owner={address} />;
}

function AccountWalletPage({ owner }: { owner?: string }) {
  const [access, setAccess] = useState<
    'checking' | 'allowed' | 'denied' | 'error'
  >('checking');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let version = 0;
    async function check() {
      const current = ++version;
      setAccess('checking');
      try {
        const response = await fetch('/gateway/auth/session', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok && response.status !== 401)
          throw new Error('Session unavailable');
        const session = response.ok ? await response.json() : null;
        if (controller.signal.aborted || current !== version) return;
        setAccess(
          owner &&
            session?.chainId === sepolia.id &&
            typeof session.address === 'string' &&
            session.address.toLowerCase() === owner.toLowerCase()
            ? 'allowed'
            : 'denied',
        );
      } catch {
        if (!controller.signal.aborted && current === version)
          setAccess('error');
      }
    }
    void check();
    window.addEventListener('wayleave:owner-session', check);
    return () => {
      controller.abort();
      window.removeEventListener('wayleave:owner-session', check);
    };
  }, [owner, revision]);

  return (
    <section className="wl-agent-settings accounts-page account-new-page">
      <Link className="accounts-back" href="/accounts">
        <ArrowLeft size={16} aria-hidden="true" /> Your wallets
      </Link>
      <div className="flow-heading">
        <span className="flow-eyebrow">A NEW AGENT WALLET</span>
        <h1>Create a wallet</h1>
        <p>
          Give your agent a wallet of its own. You hold the ownership NFT and
          stay in control.
        </p>
      </div>
      {access === 'allowed' ? (
        <WalletCreation owner={owner!} />
      ) : (
        <div className="flow-surface account-gate">
          <KeyRound size={28} aria-hidden="true" />
          {access === 'checking' ? (
            <p role="status">Checking your account…</p>
          ) : access === 'error' ? (
            <>
              <h2>We couldn’t check your account</h2>
              <p>Try again to verify your session before creating a wallet.</p>
              <button
                className="secondary"
                onClick={() => setRevision((value) => value + 1)}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <h2>Sign in to create a wallet</h2>
              <p>
                Use your verified Wayleave account so the ownership NFT goes to
                your wallet.
              </p>
              <Link className="primary account-create-link" href="/">
                Go to sign in →
              </Link>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function WalletCreation({ owner }: { owner: string }) {
  const [network, setNetwork] = useState<'Sepolia' | 'Arc'>('Sepolia');
  const [verified, setVerified] = useState({ Sepolia: '', Arc: '' });
  return (
    <div className="account-create-layout">
      <div className="account-create-main">
        <nav className="account-chain-choice" aria-label="Wallet network">
          {(['Sepolia', 'Arc'] as const).map((chain) => (
            <button
              key={chain}
              type="button"
              aria-pressed={network === chain}
              onClick={() => setNetwork(chain)}
            >
              <span>{chain === 'Arc' ? 'Arc Testnet' : chain}</span>
              <small>
                {chain === 'Arc' ? 'USDC payments' : 'Wallet + ENS name'}
              </small>
              {verified[chain] && <Check size={16} aria-label="Verified" />}
            </button>
          ))}
        </nav>
        {(['Sepolia', 'Arc'] as const).map((chain) => (
          <div key={chain} hidden={network !== chain}>
            <ChainWalletSetup
              network={chain}
              restoreVerified={false}
              onAccount={(account) =>
                setVerified((value) => ({ ...value, [chain]: account }))
              }
            />
          </div>
        ))}
        {verified[network] && (
          <div className="account-created" role="status">
            <Check size={18} aria-hidden="true" />
            <div>
              <h2>Your wallet is verified</h2>
              <p>
                Ownership has been checked on{' '}
                {network === 'Arc' ? 'Arc Testnet' : network}.
              </p>
              <Link
                href={`/accounts?network=${network.toLowerCase()}&account=${verified[network]}`}
              >
                View your wallets →
              </Link>
            </div>
          </div>
        )}
      </div>
      <aside
        className="account-ownership"
        aria-label="Wallet ownership explained"
      >
        <span className="flow-eyebrow">OWNED BY YOU</span>
        <div className="account-owner-node">
          <Wallet size={24} aria-hidden="true" />
          <strong>Your wallet</strong>
          <code title={owner}>
            {owner.slice(0, 6)}…{owner.slice(-4)}
          </code>
        </div>
        <ArrowDown
          className="account-ownership-arrow"
          size={22}
          aria-hidden="true"
        />
        <div className="account-nft-node">
          <KeyRound size={24} aria-hidden="true" />
          <div>
            <strong>Ownership NFT</strong>
            <span>Controls your new agent wallet</span>
          </div>
        </div>
        <h2>One more agent. Same owner.</h2>
        <p>
          The NFT is held in your wallet. Your agent gets a scoped connection;
          your signing key stays with you.
        </p>
        <details>
          <summary>What does creation include?</summary>
          <p>
            {network === 'Sepolia'
              ? 'A Sepolia wallet, its ownership NFT and an ENS name. Creation uses Sepolia ETH.'
              : 'A separate Arc wallet and ownership NFT. Creation uses test USDC. Your Sepolia wallet and ENS records stay in place.'}{' '}
            You’ll confirm the creation transaction in your wallet.
          </p>
        </details>
        <p className="account-testnet-note">
          {network === 'Arc' ? 'Arc Testnet' : 'Sepolia'} · Test funds only
        </p>
      </aside>
    </div>
  );
}
