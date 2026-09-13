import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { WayleaveMark } from './wayleave-mark';
import './app-frame.css';
import { AccountNav } from './account-nav';
import { NetworkSelector } from './network-selector';

export function AppFrame({
  children,
  active = 'agents',
  network,
}: {
  children: ReactNode;
  active?:
    | 'agents'
    | 'account'
    | 'tools'
    | 'connect'
    | 'identity'
    | 'crosschain'
    | 'payments'
    | 'store';
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
          <NetworkSelector />
          <AccountNav />
        </div>
        <nav aria-label="Main navigation">
          <Link
            href="/spending"
            aria-current={active === 'agents' ? 'page' : undefined}
          >
            Spending
          </Link>
          <Link
            href="/payments"
            aria-current={
              active === 'payments' || active === 'crosschain'
                ? 'page'
                : undefined
            }
          >
            Payments
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
            Name & access
          </Link>
        </nav>
      </header>
      <main id="app-main" className="account-home">
        {children}
      </main>
      <footer className="app-footer">
        <span>{network ?? 'Sepolia & Arc'} · Test funds only</span>
        <Link href="/advanced">
          Developer tools <ArrowUpRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
