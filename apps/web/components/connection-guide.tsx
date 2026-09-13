import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function ConnectionGuide() {
  return (
    <section
      className="landing-connect"
      id="connect-agent"
      aria-labelledby="connect-agent-title"
    >
      <div>
        <span className="entry-eyebrow">Setup</span>
        <h2 id="connect-agent-title">
          Connect your
          <br />
          agent app.
        </h2>
        <p>
          Your agent can check its wallet, request a payment, and follow its
          status. You approve the spending here.
        </p>
        <Link href="/?setup=1" className="primary">
          Get started <ArrowRight size={16} />
        </Link>
      </div>
      <div className="connection-guide-steps">
        <ol>
          <li>
            <span>01</span>
            <div>
              <h3>Start with your wallet</h3>
              <p>
                Create an agent wallet or choose one you already own. Its
                ownership NFT stays in your wallet.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Link your agent app</h3>
              <p>
                Add the connection settings from setup to your app. You can
                follow the instructions yourself or use the provided setup
                prompt with your agent.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Ask it to request a payment</h3>
              <p>
                Your agent sends a review link. Check the amount and recipient,
                then approve in your wallet.
              </p>
            </div>
          </li>
        </ol>
        <details>
          <summary>Can I do everything inside ChatGPT or Claude?</summary>
          <p>
            Wallet setup and payment approval happen here. Hosted MCP works with
            clients that accept a remote URL and custom bearer token; OAuth-only
            chat connectors are not supported. You can also connect through a
            local MCP client.
          </p>
        </details>
      </div>
    </section>
  );
}
