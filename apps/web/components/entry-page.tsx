import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Badge,
  Code2,
  Fingerprint,
  LockKeyhole,
  Search,
  Wallet,
} from 'lucide-react';
import { WayleaveMark } from './wayleave-mark';
import styles from './entry-page.module.css';

/** Shared public entry and recovery layout. Illustrations never represent account state. */
export function EntryPage({
  variant,
  children,
}: {
  variant: 'signin' | 'not-found';
  children?: ReactNode;
}) {
  const signin = variant === 'signin';
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#entry-main">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Wayleave home">
          <WayleaveMark width={32} height={32} />
          wayleave
        </Link>
        <Link
          className={styles.headerLink}
          href={signin ? '/?setup=1' : '/?signin=1'}
        >
          {signin ? 'Get started' : 'Sign in'}{' '}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>
      <main className={styles.main} id="entry-main">
        <section className={styles.copy} aria-labelledby="entry-title">
          <span className={styles.eyebrow}>
            {signin ? 'YOUR WALLET. YOUR WAYLEAVE.' : '404 · PAGE NOT FOUND'}
          </span>
          <h1 id="entry-title">
            {signin ? 'Welcome back.' : 'A little off course.'}
          </h1>
          <p className={styles.description}>
            {signin
              ? 'Your agents. Their spending. All in one place. Sign in with the wallet that owns your agent wallets.'
              : 'We couldn’t find this page. The link may have changed, or the address might be a little out of place.'}
          </p>
          <div className={styles.actions}>
            {signin ? (
              children
            ) : (
              <Link className={styles.primary} href="/">
                Back to home <ArrowRight size={18} aria-hidden="true" />
              </Link>
            )}
          </div>
          <div className={styles.note}>
            {signin ? (
              <>
                <LockKeyhole size={17} aria-hidden="true" />
                <p>
                  Signing in verifies ownership.
                  <br />
                  It doesn’t move money or grant spending access.
                </p>
              </>
            ) : (
              <>
                <Search size={17} aria-hidden="true" />
                <p>
                  Looking for your agents?
                  <br />
                  <Link href="/payments">
                    Open your payments{' '}
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                </p>
              </>
            )}
          </div>
          {signin && (
            <p className={styles.secondary}>
              New to Wayleave?{' '}
              <Link href="/?setup=1">
                Set up your first agent{' '}
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </p>
          )}
        </section>
        <aside
          className={styles.panel}
          aria-label={
            signin ? 'Wallet ownership explained' : 'A path back home'
          }
        >
          <span className={styles.panelLabel}>
            {signin ? 'OWNERSHIP STAYS WITH YOU' : 'THERE’S ALWAYS A WAY BACK'}
          </span>
          {signin ? (
            <div className={styles.diagram}>
              <div className={styles.wallet}>
                <span className={styles.walletIcon}>
                  <WayleaveMark width={38} height={38} />
                </span>
                <div>
                  <strong>Your wallet</strong>
                  <span>Your funds + ownership NFTs</span>
                </div>
                <LockKeyhole size={17} aria-hidden="true" />
              </div>
              <div className={styles.branches} aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <div className={styles.agents}>
                {[Wallet, Fingerprint, Code2].map((Icon, index) => (
                  <div className={styles.agent} key={index}>
                    <Icon size={31} strokeWidth={1.6} aria-hidden="true" />
                    <span>Agent wallet</span>
                    <small>
                      <Badge size={12} aria-hidden="true" /> Owned by you
                    </small>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.lost} aria-hidden="true">
              <svg viewBox="0 0 440 270" fill="none">
                <path
                  d="M30 215H110Q145 215 145 180V110Q145 75 180 75H255Q290 75 290 110V190Q290 220 320 220H408"
                  stroke="#b4bdb1"
                  strokeWidth="2"
                  strokeDasharray="5 8"
                  strokeLinecap="round"
                />
                <circle cx="30" cy="215" r="6" fill="#87927f" />
                <circle cx="408" cy="220" r="6" fill="#87927f" />
              </svg>
              <div className={styles.homeMark}>
                <WayleaveMark width={54} height={54} />
              </div>
              <span className={styles.number}>404</span>
            </div>
          )}
          <div className={styles.caption}>
            <h2>
              {signin ? 'Your keys stay yours.' : 'Let’s find familiar ground.'}
            </h2>
            <p>
              {signin
                ? 'Your wallet holds the ownership NFTs. Your agents get a scoped connection. You keep the final say on payments.'
                : 'Head home to get your bearings, or sign in to pick up where you left off.'}
            </p>
          </div>
        </aside>
      </main>
      <footer className={styles.footer}>
        <span>Sepolia & Arc · Test funds only</span>
        <span>Agent wallets, owned by you.</span>
      </footer>
    </div>
  );
}
