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
  publicFacing = false,
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
  publicFacing?: boolean;
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
          {!publicFacing && (
            <>
              <NetworkSelector />
              <AccountNav />
            </>
          )}
        </div>
        {publicFacing ? (
          <nav aria-label="Main navigation">
            <Link href="/payments" aria-current="page">
              Payments
            </Link>
            <Link href="/spending">Open Spending</Link>
            <Link href="/?setup=1">Get started</Link>
          </nav>
        ) : (
          <nav aria-label="Main navigation">
            <Link
              href="/spending"
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
              Agent access
            </Link>
            <Link
              href="/identity"
              aria-current={active === 'identity' ? 'page' : undefined}
            >
              Name & access
            </Link>
          </nav>
        )}
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
