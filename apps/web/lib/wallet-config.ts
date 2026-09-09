import { http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { foundry } from 'wagmi/chains';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { hackathonSepolia } from '@mandate/sdk';
import { getDevWalletProvider } from './dev-wallet';

// Public project identifier, not a wallet credential or signing key.
const projectId = '74fcd78221a94fe49836612d214f6e3e';
const devWalletEnabled =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_MANDATE_DEV_WALLET === 'true';
const adapter = new WagmiAdapter({
  projectId,
  networks: [hackathonSepolia, foundry],
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
    [hackathonSepolia.id]: http(),
  },
  ssr: true,
});

export const walletConfig = adapter.wagmiConfig;
const appKit = createAppKit({
  adapters: [adapter],
  projectId,
  networks: [hackathonSepolia, foundry],
  defaultNetwork: hackathonSepolia,
  metadata: {
    name: 'Wayleave',
    description: 'Your accounts, agents and approvals',
    url:
      typeof window === 'undefined'
        ? 'http://localhost:3000'
        : window.location.origin,
    icons: [],
  },
  themeMode: 'dark',
  features: {
    analytics: false,
    email: false,
    socials: false,
    swaps: false,
    onramp: false,
  },
  enableCoinbase: false,
});

export async function openWalletPicker() {
  if (!appKit)
    throw new Error('Wallet picker is only available in the browser.');
  await appKit.open({ view: 'Connect', namespace: 'eip155' });
}
