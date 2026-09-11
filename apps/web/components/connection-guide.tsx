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
        <span className="entry-eyebrow">Bring your agent along.</span>
        <h2 id="connect-agent-title">
          A connection.
          <br />
          Then a conversation.
        </h2>
        <p>
          Your agent can check its wallet, request a payment, and follow its
          status. You approve the spending here.
        </p>
        <Link href="/?setup=1" className="primary">
          Connect your agent <ArrowRight size={16} />
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
                Choose Codex, Claude Desktop, or Cursor. Copy the connection
                settings into that app.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Ask it to make a payment</h3>
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
            Not yet. The current connection works with local MCP clients. Wallet
            setup and payment approval happen here. Embedded chat approvals and
            terminal QR pairing are still being built.
          </p>
        </details>
      </div>
    </section>
  );
}
