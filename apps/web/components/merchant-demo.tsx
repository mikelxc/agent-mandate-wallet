'use client';

import Link from 'next/link';
import { useState } from 'react';
import { purchaseInstruction } from '../lib/merchant-purchase';

export function MerchantDemo() {
  const [status, setStatus] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(purchaseInstruction);
      setStatus('Copied. Paste this into your connected agent.');
    } catch {
      setStatus(
        'Select and copy the prompt above to share it with your agent.',
      );
    }
  }
  return (
    <section
      id="demo"
      className="merchant-demo"
      aria-labelledby="merchant-demo-title"
    >
      <div className="merchant-demo-description">
        <span className="merchant-eyebrow">TRY IT WITH YOUR AGENT</span>
        <h2 id="merchant-demo-title">We’re our first merchant.</h2>
        <p>
          Ask your agent to buy the Wayleave Developer Pack. Open the approval
          link to review and sign in Spending, then your agent retrieves the
          files.
        </p>
        <div className="merchant-demo-product">
          <span aria-hidden="true">↗</span>
          <div>
            <h3>Wayleave Developer Pack</h3>
            <p>
              Architecture notes, validator source, deployment evidence, and a
              sample dataset.
            </p>
          </div>
        </div>
        <p className="merchant-demo-caption">
          A testnet purchase with real payment and delivery checks. Your agent
          checks the current price and fees before you approve.
        </p>
      </div>
      <div className="merchant-demo-prompt">
        <span className="merchant-eyebrow">GIVE YOUR AGENT THIS TASK</span>
        <blockquote>{purchaseInstruction}</blockquote>
        <button onClick={copy}>
          Copy agent prompt <span aria-hidden="true">↗</span>
        </button>
        <p role="status">{status}</p>
        <Link href="/connect">Connect an agent to try it</Link>
        <p className="merchant-demo-caption">
          Test funds only. You approve and sign; gas is additional. Delivery
          unlocks after destination settlement is verified.
        </p>
      </div>
    </section>
  );
}
