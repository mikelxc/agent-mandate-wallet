import { AppFrame } from '../../../components/app-frame';
import { ChainWalletWalkthrough } from '../../../components/chain-wallet-walkthrough';
export default function NewWalletPage() {
  return (
    <AppFrame active="account">
      <ChainWalletWalkthrough newWallet />
    </AppFrame>
  );
}
