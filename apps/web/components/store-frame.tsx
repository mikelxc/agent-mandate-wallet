import type { ReactNode } from 'react';
import Link from 'next/link';
import { WayleaveMark } from './wayleave-mark';
import './app-frame.css';

/** Public merchant pages never need wallet providers or an owner session. */
export function StoreFrame({ children }: { children: ReactNode }) {
  return (
    <div className="wayleave-app">
      <a className="app-skip" href="#app-main">
        Skip to content
      </a>
      <header className="app-header">
        <Link className="app-brand" href="/">
          <WayleaveMark width={32} height={32} />
          wayleave
        </Link>
      </header>
      <main id="app-main" className="account-home">
        {children}
      </main>
      <footer className="app-footer">
        <span>Agent purchase endpoint · Testnet</span>
      </footer>
    </div>
  );
}
