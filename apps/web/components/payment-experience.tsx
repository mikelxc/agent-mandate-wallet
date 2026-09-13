'use client';
import Link from 'next/link';
import { ArrowRight, Store } from 'lucide-react';

export function MerchantAcceptance() {
  return (
    <div className="merchant-layout">
      <div className="merchant-intro">
        <span className="flow-symbol">
          <Store size={24} />
        </span>
        <h2>
          Your customer has a name.
          <br />
          You receive USDC.
        </h2>
        <p>
          Let an agent bring a purchase to its owner for approval. Receive the
          payment in your merchant wallet on the supported destination network.
        </p>

        <p className="flow-note">
          Wayleave is the first merchant. Self-serve merchant onboarding is not
          available yet.
        </p>
      </div>
      <section
        className="merchant-receiving"
        aria-label="Merchant acceptance availability"
      >
        <div className="merchant-receiving-heading">
          <span className="flow-eyebrow">RECEIVING NETWORK</span>
          <span className="merchant-test-label">Current test route</span>
        </div>
        <h3>Ethereum Sepolia</h3>
        <p>Native test USDC</p>
        <div className="merchant-route-line">
          <span>Customer pays on Arc</span>
          <ArrowRight size={16} />
          <span>You receive on Sepolia</span>
        </div>
        <ol className="payments-steps">
          <li>
            <span>01</span>
            <div>
              <h3>Describe the purchase</h3>
              <p>
                Publish an offering that the agent can discover. The trusted
                gateway supplies the recipient and exact USDC terms.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Request owner approval</h3>
              <p>
                The agent submits the request through its scoped bearer-token
                Wayleave connection.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Verify, then deliver</h3>
              <p>
                Confirm USDC arrived before releasing the purchase. An approval
                alone is not a receipt.
              </p>
            </div>
          </li>
        </ol>
        <details className="flow-disclosure">
          <summary>Integration scope</summary>
          <p>
            The existing agent API accepts proposals for an associated Arc
            account. The Developer Pack store uses the merchant API. Additional
            merchants and automatic delivery notifications still need
            integration.
          </p>
          <p>
            The current payment amount is the source debit. Transfer fees reduce
            merchant receipt, and gas is additional. Agree these terms before
            requesting payment.
          </p>
          <Link href="/connect">Grant agent access ↗</Link>
        </details>
      </section>
      <div className="merchant-future">
        <span className="flow-eyebrow">WHERE WE’RE HEADING</span>
        <p>
          One payment identity. Merchant acceptance across CCTP-supported
          networks.
        </p>
        <span>
          Additional destinations are planned. This release supports Ethereum
          Sepolia only.
        </span>
      </div>
    </div>
  );
}
