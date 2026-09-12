import { http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { foundry, arcTestnet } from 'wagmi/chains';
import { createAppKit } from '@reown/appkit/react';
import { RouterController } from '@reown/appkit-controllers';
import { hackathonSepolia } from '@mandate/sdk';
import { getDevWalletProvider } from './dev-wallet';
import { ownerAuth, prepareOwnerAuth } from './owner-auth';
import { getWalletNetworks, walletConnectSessionConfig } from './wallet-connect';
import { OwnerWalletAdapter } from './wallet-adapter';

// Public project identifier, not a wallet credential or signing key.
const projectId = '74fcd78221a94fe49836612d214f6e3e';
const devWalletEnabled =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_MANDATE_DEV_WALLET === 'true';
const networks = getWalletNetworks(devWalletEnabled);
const adapter = new OwnerWalletAdapter({
  projectId,
  networks,
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
    [arcTestnet.id]: http(),
  },
  ssr: true,
});

export const walletConfig = adapter.wagmiConfig;
const appKit = createAppKit({
  adapters: [adapter],
  projectId,
  networks,
  defaultNetwork: hackathonSepolia,
  siweConfig: devWalletEnabled ? undefined : ownerAuth,
  universalProviderConfigOverride: walletConnectSessionConfig,
  experimental_preferUniversalLinks: true,
  metadata: {
    name: 'Wayleave',
    description: 'Agent wallets, owned by you',
    url:
      typeof window === 'undefined'
        ? 'http://localhost:3000'
        : window.location.origin,
    icons:
      typeof window === 'undefined'
        ? []
        : [`${window.location.origin}/icon-192.png`],
  },
  themeMode: 'light',
  themeVariables: {
    '--w3m-accent': '#252a27',
    '--w3m-border-radius-master': '4px',
  },
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
  if (!devWalletEnabled) {
    // defaultNetwork does not override AppKit's persisted active network.
    // The gateway's ownership challenge is explicitly bound to Sepolia.
    await appKit.switchNetwork(hackathonSepolia, { throwOnFailure: true });
    await prepareOwnerAuth();
  }
  await appKit.open({ view: 'Connect', namespace: 'eip155' });
}

export async function verifyConnectedOwner() {
  if (!appKit)
    throw new Error('Wallet picker is only available in the browser.');
  await appKit.switchNetwork(hackathonSepolia, { throwOnFailure: true });
  await prepareOwnerAuth();
  // Give Safari a fresh user gesture after challenge preparation/network switching.
  // Calling signIn here starts the wallet redirect after those asynchronous tasks.
  await appKit.open({ namespace: 'eip155' });
  RouterController.replace('SIWXSignMessage');
}
