import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { WayleaveMark } from './wayleave-mark';
import './app-frame.css';
import { NetworkSelector } from './network-selector';

export function AppFrame({
  children,
  active = 'agents',
  network = 'Sepolia',
}: {
  children: ReactNode;
  active?:
    | 'agents'
    | 'account'
    | 'tools'
    | 'connect'
    | 'identity'
    | 'crosschain';
  network?: 'Sepolia' | 'Arc';
}) {
  return (
    <div className="wayleave-app">
      <a className="app-skip" href="#app-main">
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-brand-group">
          <Link href="/" className="app-brand">
            <span>
              <WayleaveMark width={32} height={32} />
            </span>
            wayleave
          </Link>
          <NetworkSelector network={network} />
        </div>
        <nav aria-label="Main navigation">
          <Link
            href="/"
            aria-current={active === 'agents' ? 'page' : undefined}
          >
            Spending
          </Link>
          <Link
            href="/accounts"
            aria-current={active === 'account' ? 'page' : undefined}
          >
            Wallets
          </Link>
          <Link
            href="/connect"
            aria-current={active === 'connect' ? 'page' : undefined}
          >
            Connect an agent
          </Link>
          <Link
            href="/identity"
            aria-current={active === 'identity' ? 'page' : undefined}
          >
            Identity
          </Link>
          <Link
            href="/crosschain"
            aria-current={active === 'crosschain' ? 'page' : undefined}
          >
            Cross-chain payments
          </Link>
        </nav>
      </header>
      <main id="app-main" className="account-home">
        {children}
      </main>
      <footer className="app-footer">
        <span>{network} · Test funds only</span>
        <Link href="/advanced">
          Developer tools <ArrowUpRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
