import { AppFrame } from '../../../components/app-frame';
import { ChainWalletWalkthrough } from '../../../components/chain-wallet-walkthrough';
export default function WalletSetupPage() {
  return (
    <AppFrame active="account">
      <ChainWalletWalkthrough />
    </AppFrame>
  );
}
