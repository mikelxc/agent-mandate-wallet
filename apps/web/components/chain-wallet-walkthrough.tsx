'use client';
import { useState } from 'react';
import { useConnection } from 'wagmi';
import Link from 'next/link';
import { ChainWalletSetup } from './arc-wallet-setup';
import './agent-flows.css';
import './chain-wallet-walkthrough.css';

export function ChainWalletWalkthrough() {
  const { address } = useConnection();
  return <Walkthrough key={address ?? 'disconnected'} />;
}
function Walkthrough() {
  const { address } = useConnection();
  const [step, setStep] = useState<'Sepolia' | 'Arc'>('Sepolia');
  const [wallets, setWallets] = useState({ Sepolia: '', Arc: '' });
  const [error, setError] = useState('');
  return (
    <section
      className="wl-agent-settings chain-wallet-walkthrough"
      aria-label="Create wallets on both chains"
    >
      <span className="flow-eyebrow">ONE WALLET PER CHAIN</span>
      <h1>Your agent, on two networks.</h1>
      <p>
        Mint a wallet and its ownership NFT on Sepolia, then on Arc. Each NFT
        controls only its wallet on that chain. Addresses, balances and
        ownership are independent.
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
            onAccount={(account) =>
              setWallets((current) => ({ ...current, [network]: account }))
            }
          />
        </div>
      ))}
      {step === 'Sepolia' && wallets.Sepolia && (
        <button className="primary" onClick={() => setStep('Arc')}>
          Next: mint on Arc →
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
          <Link href="/connect">Continue to agent connection →</Link>
        </div>
      )}
      <p className="flow-note">
        Two separate confirmations. Sepolia needs test ETH; Arc needs test USDC.
        No token allowance or payment is approved by minting.{' '}
        <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">
          Get Arc test USDC ↗
        </a>
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
