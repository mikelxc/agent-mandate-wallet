'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, type Config } from 'wagmi';
import { useEffect, useState } from 'react';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState(false);
  useEffect(() => {
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
  }, []);
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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
