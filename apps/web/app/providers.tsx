'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { foundry, sepolia } from 'wagmi/chains';
import { useState } from 'react';
import { getDevWalletProvider } from '../lib/dev-wallet';

const devWalletEnabled =
  import.meta.env.DEV && import.meta.env.VITE_MANDATE_DEV_WALLET === 'true';
const config = createConfig({
  chains: [foundry, sepolia],
  connectors: [
    ...(devWalletEnabled
      ? [
          injected({
            shimDisconnect: false,
            target: {
              id: 'mandate-dev-wallet',
              name: 'Mandate Local Test Wallet',
              provider: () => getDevWalletProvider() as never,
            },
          }),
        ]
      : []),
    injected(),
  ],
  transports: {
    [foundry.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(),
  },
  ssr: true,
});
export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
