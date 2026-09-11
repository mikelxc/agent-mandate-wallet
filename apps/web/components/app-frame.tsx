import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

export function AppFrame({
  children,
  active = 'agents',
}: {
  children: ReactNode;
  active?: 'agents' | 'account' | 'tools' | 'connect';
}) {
  return (
    <div className="wayleave-app">
      <a className="app-skip" href="#app-main">
        Skip to content
      </a>
      <header className="app-header">
        <Link href="/" className="app-brand">
          <span>
            <ShieldCheck size={23} />
          </span>
          wayleave<span className="app-testnet">Sepolia testnet</span>
        </Link>
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
        </nav>
      </header>
      <main id="app-main" className="account-home">
        {children}
      </main>
      <footer className="app-footer">
        <span>Sepolia · Test funds only</span>
        <Link href="/advanced">
          Developer tools <ArrowUpRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
