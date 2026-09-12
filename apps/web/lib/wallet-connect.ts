import { hackathonSepolia } from '@mandate/sdk';
import { arcTestnet, foundry } from 'viem/chains';

// AppKit 1.8.23's authenticate() reads the registered networks directly,
// bypassing universalProviderConfigOverride. Filter at registration as well
// as at session proposal time so mobile authentication never requests Anvil.
// Local test mode disables SIWE and retains Anvil for the injected dev wallet.
export function getWalletNetworks(devWalletEnabled: boolean): [
  typeof hackathonSepolia,
  ...(typeof arcTestnet | typeof foundry)[],
] {
  return devWalletEnabled
    ? [hackathonSepolia, arcTestnet, foundry]
    : [hackathonSepolia, arcTestnet];
}

const sepoliaCaipNetwork = `eip155:${hackathonSepolia.id}`;

// WalletConnect runs in a separate wallet, so it cannot reach this app's local
// Anvil node. Keep foundry in explicit local test mode, but never include
// it in the namespace proposed to mobile or desktop WalletConnect wallets.
export const walletConnectSessionConfig = {
  chains: { eip155: [sepoliaCaipNetwork, `eip155:${arcTestnet.id}`] },
  defaultChain: sepoliaCaipNetwork,
};
