'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useConnection } from 'wagmi';
import Link from 'next/link';
import { isAddress } from 'viem';
import { isPublicPage, safeReturnTo } from '../lib/access-policy';
const ownerSessionEvent = 'wayleave:owner-session';

export function AccountAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { address } = useConnection();
  const signIn = pathname === '/' && params.get('signin') === '1';
  const publicPage = isPublicPage(pathname, params.toString()) && !signIn;
  const [verified, setVerified] = useState('');
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const search = params.toString();
  useEffect(() => {
    if (publicPage) return;
    const refresh = () => setRevision(value => value + 1);
    const sessionChanged = (event: Event) => { if (!(event as CustomEvent).detail) setVerified(''); refresh(); };
    window.addEventListener(ownerSessionEvent, sessionChanged);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener(ownerSessionEvent, sessionChanged); window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, [publicPage]);
  useEffect(() => {
    if (publicPage) return;
    const controller = new AbortController();
    setError(''); setChecking(true);
    if (!address) { setVerified(''); setChecking(false); return () => controller.abort(); }
    const timeout = window.setTimeout(() => { controller.abort(); setVerified(''); setChecking(false); setError('Account verification timed out. Please retry.'); }, 15000);
    void fetch('/gateway/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.status === 401) { if (!controller.signal.aborted) setVerified(''); return; }
        if (!response.ok) throw new Error('Could not verify your account. Please retry.');
        const session = await response.json();
        if (!controller.signal.aborted && isAddress(session.address) && session.address.toLowerCase() === address.toLowerCase()) setVerified(`${address.toLowerCase()}:${pathname}`);
        else if (!controller.signal.aborted) setVerified('');
      })
      .catch(e => { if (!controller.signal.aborted) { setVerified(''); setError(e.message); } })
      .finally(() => { window.clearTimeout(timeout); if (!controller.signal.aborted) setChecking(false); });
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [publicPage, address, pathname, revision]);
  const allowed = !!address && verified === `${address.toLowerCase()}:${pathname}`;
  useEffect(() => {
    if (signIn && allowed) {
      router.replace(safeReturnTo(new URLSearchParams(search).get('returnTo')));
      router.refresh();
    }
  }, [allowed, signIn, search, router]);
  if (publicPage) return children;
  if (allowed && !signIn) return children;
  return <main className="account-route-gate">
    <Link href="/">Wayleave</Link>
    <h1>Sign in to your account</h1>
    <p>Connect and verify your owner wallet to manage wallets, spending and agent access.</p>
    {checking || allowed ? <p role="status">{allowed ? 'Opening your page…' : 'Checking your account…'}</p> :
      <button className="primary" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { const { openWalletPicker, verifyConnectedOwner } = await import('../lib/wallet-config'); if (address) await verifyConnectedOwner(); else await openWalletPicker(); }
        catch(e) { setError(e instanceof Error ? e.message : 'Could not open wallet sign-in.'); }
        finally { setBusy(false); setRevision(value => value + 1); }
      }}>{busy ? 'Check your wallet…' : address ? 'Verify your wallet' : 'Connect your wallet'}</button>}
    {error && <><p role="alert">{error}</p><button onClick={() => setRevision(value => value + 1)}>Retry account check</button></>}
    <p><Link href="/payments">Browse payments and merchants</Link> · <Link href="/?setup=1">Set up an account</Link></p>
  </main>;
}
