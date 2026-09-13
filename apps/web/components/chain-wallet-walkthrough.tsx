'use client';
import { useState } from 'react';
import { useConnection } from 'wagmi';
import Link from 'next/link';
import { ChainWalletSetup } from './chain-wallet-setup';
import './agent-flows.css';
import './chain-wallet-walkthrough.css';

export function ChainWalletWalkthrough({
  embedded = false,
  newWallet = false,
}: {
  embedded?: boolean;
  newWallet?: boolean;
}) {
  const { address } = useConnection();
  return <Walkthrough key={address ?? 'disconnected'} embedded={embedded} newWallet={newWallet} />;
}
function Walkthrough({ embedded, newWallet }: { embedded: boolean; newWallet: boolean }) {
  const { address } = useConnection();
  const [step, setStep] = useState<'Sepolia' | 'Arc'>('Sepolia');
  const [wallets, setWallets] = useState({ Sepolia: '', Arc: '' });
  const [error, setError] = useState('');
  return (
    <section
      className={`wl-agent-settings chain-wallet-walkthrough ${embedded ? 'chain-wallet-embedded' : ''}`}
      aria-label="Create wallets on both chains"
    >
      {!embedded && (
        <>
          <h1>{newWallet ? 'Create a wallet' : 'Give your agent a wallet.'}</h1>
        </>
      )}
      <p className="mint-step-intro">
        {newWallet ? 'Choose a supported chain and mint a new ownership NFT with its agent wallet.' : step === 'Sepolia'
          ? 'Start with your Sepolia wallet. Then create one on Arc for the test purchase.'
          : 'Create your Arc wallet for USDC payments. Its NFT will also appear in your wallet.'}
      </p>
      <nav aria-label="Wallet minting steps">
        {(['Sepolia', 'Arc'] as const).map((network, index) => (
          <button
            key={network}
            aria-pressed={step === network}
            onClick={() => setStep(network)}
          >
            {index + 1}. {network} {wallets[network] ? '· Verified' : ''}
          </button>
        ))}
      </nav>
      {!address && (
        <button
          className="primary"
          onClick={async () => {
            try {
              const { openWalletPicker } = await import('../lib/wallet-config');
              await openWalletPicker();
            } catch {
              setError('Wallet connection was not completed. Try again.');
            }
          }}
        >
          Connect your owner wallet
        </button>
      )}
      {(['Sepolia', 'Arc'] as const).map((network) => (
        <div key={network} hidden={step !== network}>
          <ChainWalletSetup
            network={network}
            restoreVerified={!newWallet}
            onAccount={(account) =>
              setWallets((current) => ({ ...current, [network]: account }))
            }
          />
        </div>
      ))}
      {newWallet && wallets[step] && <Link href="/accounts">View your wallets →</Link>}
      {step === 'Sepolia' && wallets.Sepolia && (
        <button className="primary" onClick={() => setStep('Arc')}>
          Next: create your Arc wallet →
        </button>
      )}
      {wallets.Arc && wallets.Sepolia && (
        <div role="status">
          <h2>Both wallets are verified.</h2>
          <p>
            Your Sepolia wallet has its ENSv2 name. Your Arc wallet is ready for
            its own agent connection and payment setup. Minting both does not
            automatically link the Sepolia name to Arc.
          </p>
          {!embedded && (
            <Link href="/connect">Continue to agent connection →</Link>
          )}
        </div>
      )}
      {step === 'Arc' && (
        <p className="flow-note">
          <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">
            Need test USDC? ↗
          </a>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
