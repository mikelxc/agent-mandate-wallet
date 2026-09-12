import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { signMessage } from 'wagmi/actions';
import { getAddress } from 'viem';
import { reportOwnerAuthError } from './owner-auth-error';

export class OwnerWalletAdapter extends WagmiAdapter {
  override async signMessage(params: Parameters<WagmiAdapter['signMessage']>[0]) {
    // AppKit 1.8.23 catches every provider failure and discards its cause.
    // Use the same wagmi action while preserving the wallet's original error
    // so failed mobile handoffs/session requests can be diagnosed.
    try {
      const signature = await signMessage(this.wagmiConfig, {
        message: params.message,
        account: getAddress(params.address),
      });
      return { signature };
    } catch (error) {
      reportOwnerAuthError(error);
      throw error;
    }
  }
}
