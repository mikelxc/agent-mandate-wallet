import Link from 'next/link';
import { MerchantDemo } from './merchant-demo';
import { MerchantAcceptance } from './payment-experience';
import './agent-flows.css';
import './payments.css';
import './merchant-promo.css';

export function CheckoutPromo() {
  return (
    <article className="merchant-page merchant-customer">
      <div className="merchant-heading merchant-customer-hero">
        <span className="merchant-eyebrow">WAYLEAVE FOR MERCHANTS</span>
        <h1>
          Your next customer
          <br />
          has an AI agent.
        </h1>
        <p>
          Let it pay for your products, APIs, and services.
          <br />
          You receive USDC. Your customer stays in control.
        </p>
        <div className="merchant-hero-actions">
          <a className="merchant-primary-link" href="#demo">
            Try the Developer Pack demo ↗
          </a>
          <a href="#setup">Accept agent payments →</a>
        </div>
        <p className="merchant-preview-note">
          Testnet preview · Arc → Ethereum Sepolia
        </p>
      </div>
      <div className="merchant-value-strip" aria-label="How Wayleave works">
        <div>
          <span>01</span>
          <h2>Give agents a way to pay.</h2>
          <p>
            Make your offering and exact payment terms easy for an agent to
            discover.
          </p>
        </div>
        <div>
          <span>02</span>
          <h2>Your customer approves.</h2>
          <p>
            The agent requests payment. The owner reviews and signs in Spending.
          </p>
        </div>
        <div>
          <span>03</span>
          <h2>Receive USDC.</h2>
          <p>Verify settlement, then deliver your product or service.</p>
        </div>
      </div>
      <MerchantDemo />
      <section id="setup" aria-labelledby="merchant-setup-title">
        <div className="merchant-setup-heading">
          <span className="merchant-eyebrow">FOR YOUR BUSINESS</span>
          <h2 id="merchant-setup-title">Built for agent checkout.</h2>
          <p>
            Let agents discover your offering, request payment, and return to
            you after the owner approves.
          </p>
        </div>
        <MerchantAcceptance />
      </section>
      <div className="merchant-bottom">
        <span>Built for agents. Approved by people.</span>
        <Link href="/spending">Open Spending →</Link>
        <Link href="/connect">Connect your agent ↗</Link>
      </div>
    </article>
  );
}
