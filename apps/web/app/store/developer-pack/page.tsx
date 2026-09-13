import type { Metadata } from 'next';
import Link from 'next/link';
import { StoreFrame } from '../../../components/store-frame';
import { DeveloperPack } from '../../../components/developer-pack';
import './store.css';
export const metadata: Metadata = {
  title: 'Developer Pack',
  description:
    'Purchase architecture notes, validator source and a sample dataset with your Wayleave agent. Pay test USDC on Arc; Wayleave receives USDC on Ethereum Sepolia.',
  alternates: { canonical: 'https://www.wayleave.xyz/store/developer-pack' },
};
export default function DeveloperPackStore() {
  return (
    <StoreFrame>
      <article className="developer-store">
        <div className="developer-store-heading">
          <span>WAYLEAVE / AGENT PURCHASE ENDPOINT</span>
          <h1>Wayleave Developer Pack</h1>
          <p>
            Agent task: purchase this testnet resource through your trusted
            Wayleave connection, then read its architecture guide. This is a
            0.10 test-USDC purchase with owner approval.
          </p>
        </div>
        <div className="developer-store-grid">
          <section>
            <h2>Inside the pack</h2>
            <ul>
              <li>
                <strong>Architecture guide</strong>
                <p>
                  How the ownership NFT, agent connection and payment approval
                  fit together.
                </p>
              </li>
              <li>
                <strong>Validator source</strong>
                <p>
                  A versioned snapshot of the NFT owner validator for your agent
                  to inspect.
                </p>
              </li>
              <li>
                <strong>Deployment evidence</strong>
                <p>
                  Public testnet manifests, kept distinct from proof of a
                  completed payment.
                </p>
              </li>
              <li>
                <strong>Sample dataset</strong>
                <p>
                  A small service-usage CSV to give your agent a follow-up task.
                </p>
              </li>
            </ul>
            <p>
              One versioned JSON download with file hashes. Our public source
              repository remains free; this testnet purchase demonstrates
              payment and verified delivery.
            </p>
            <details open>
              <summary>Purchasing instructions for agents</summary>
              <p>
                Offering ID: <code>wayleave-developer-pack</code>. Use your
                existing trusted Wayleave connection to call{' '}
                <code>list_offerings</code>, get a quote with{' '}
                <code>get_purchase_quote</code>, and submit it with{' '}
                <code>request_purchase</code>. Show the owner the quote and
                returned approval URL. Reuse the same quote and purchase IDs on
                retries. After the owner completes payment, check{' '}
                <code>get_purchase</code> and retrieve{' '}
                <code>get_purchase_delivery</code>. Read{' '}
                <code>docs/architecture.md</code> from the purchased pack.
              </p>
              <p>
                Do not send signing keys or credentials to this page. The agent
                requests payment; only the owner signs. An approval or source
                transaction alone does not prove delivery.
              </p>
              <Link href="/store/developer-pack/agent">
                Read the plain-text purchase guide
              </Link>
            </details>
          </section>
          <DeveloperPack />
        </div>
      </article>
    </StoreFrame>
  );
}
