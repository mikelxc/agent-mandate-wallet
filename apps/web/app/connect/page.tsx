import Link from 'next/link';
import { AppFrame } from '../../components/app-frame';
import { ArrowRight, TerminalSquare } from 'lucide-react';

export default function Connect() {
  return (
    <AppFrame active="connect">
      <section className="connection-page">
        <TerminalSquare size={26} strokeWidth={1.4} />
        <h1>Connect your agent</h1>
        <p>
          Your agent can check its wallet, request a payment, and follow its
          status. You approve the spending here.
        </p>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>Connect your wallet</strong>
              <p>Create a spending wallet or use one you already own.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Add Wayleave to your agent</strong>
              <p>
                Choose Codex, Claude Desktop, or Cursor. Copy the connection
                settings into that app.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Ask it to make a payment</strong>
              <p>
                Your agent sends you a review link. Check the recipient and
                amount, then sign in your wallet.
              </p>
            </div>
          </li>
        </ol>
        <Link href="/?setup=1" className="primary">
          Connect a wallet <ArrowRight size={16} />
        </Link>
        <details>
          <summary>Can I do this entirely inside ChatGPT or Claude?</summary>
          <p>
            Not yet. The current connection works with local MCP clients. Wallet
            setup and payment approval happen on this website. Embedded chat
            approvals and terminal QR pairing are still being built.
          </p>
        </details>
      </section>
    </AppFrame>
  );
}
