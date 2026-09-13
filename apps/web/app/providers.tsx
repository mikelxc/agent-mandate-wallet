'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, type Config } from 'wagmi';
import { Suspense, useEffect, useState } from 'react';
import { AccountAccessGate } from '../components/account-access-gate';
import { usePathname } from 'next/navigation';

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicStore = pathname === '/store/developer-pack';
  const [queryClient] = useState(() => new QueryClient());
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (publicStore) return;
    let active = true;
    // AppKit's browser SDK must not be evaluated during server rendering.
    void import('../lib/wallet-config')
      .then(({ walletConfig }) => {
        if (active) setConfig(walletConfig);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [publicStore]);
  // The merchant page has no wallet hooks. Render its content on the server so
  // an agent can read the product and purchasing guide without booting AppKit.
  if (publicStore) return children;
  if (!config)
    return (
      <main style={{ margin: 0, padding: 32 }}>
        <p role="status">
          {error ? 'Wallet setup could not load.' : 'Loading Wayleave…'}
        </p>
        {error && (
          <button onClick={() => window.location.reload()}>Try again</button>
        )}
      </main>
    );
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}><Suspense fallback={<p>Checking account access…</p>}><AccountAccessGate>{children}</AccountAccessGate></Suspense></QueryClientProvider>
    </WagmiProvider>
  );
}
