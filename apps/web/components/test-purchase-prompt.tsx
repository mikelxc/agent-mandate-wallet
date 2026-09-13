'use client';
import { useState } from 'react';
import { useConnection } from 'wagmi';
import { Check, Clipboard } from 'lucide-react';
import { purchaseInstruction } from '../lib/merchant-purchase';

export function TestPurchasePrompt() {
  const { address } = useConnection();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return (
    <section
      className="test-purchase-prompt"
      aria-label="Try your first purchase"
    >
      <span className="flow-eyebrow">TRY YOUR AGENT · TESTNET</span>
      <h2>Put your wallet to work.</h2>
      <p>
        Ask your connected agent to buy the Developer Pack for 0.10 test USDC.
        Open its approval link to review the request, then ask it to explain what it bought.
      </p>
      <details className="test-purchase-funding">
        <summary>Need test USDC?</summary>
        <p>Open Circle’s faucet, select USDC and Arc Testnet, and use your connected owner wallet address. The faucet currently provides 20 test USDC, covering the purchase and Arc gas. Leave room for fees instead of funding exactly 0.10.</p>
        {address ? <p>Funding wallet: <code>{address}</code></p> : <p>Connect your owner wallet to see the address to fund.</p>}
        <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get free test USDC ↗</a>
        <p>Payment review will guide you through the capped allowance and account gas deposit. Completing settlement on Ethereum Sepolia also requires Sepolia ETH in your signing wallet.</p>
      </details>
      <blockquote>{purchaseInstruction}</blockquote>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(purchaseInstruction);
            setCopied(true);
            setError('');
          } catch {
            setError(
              'Copy the instruction above. Clipboard access is unavailable.',
            );
          }
        }}
      >
        {copied ? <Check size={15} /> : <Clipboard size={15} />}{' '}
        {copied ? 'Instruction copied' : 'Copy purchase instruction'}
      </button>
      <p className="flow-note">
        Your agent visits the public purchase page. Open its approval link to approve and
        track the payment in Spending. Transfer fees and gas are additional; review the
        exact quote before signing.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
