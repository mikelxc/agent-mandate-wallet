import { hackathonSepolia } from '@mandate/sdk';

const sepoliaCaipNetwork = `eip155:${hackathonSepolia.id}`;

// WalletConnect runs in a separate wallet, so it cannot reach this app's local
// Anvil node. Keep foundry in wagmi for the local test wallet, but never include
// it in the namespace proposed to mobile or desktop WalletConnect wallets.
export const walletConnectSessionConfig = {
  chains: { eip155: [sepoliaCaipNetwork] },
  defaultChain: sepoliaCaipNetwork,
};
