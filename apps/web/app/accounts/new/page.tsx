import { AppFrame } from '../../../components/app-frame';
import { NewAccountWallet } from '../../../components/new-account-wallet';
import '../../../components/agent-flows.css';
import '../accounts.css';

export default function NewWalletPage() {
  return (
    <AppFrame active="account">
      <NewAccountWallet />
    </AppFrame>
  );
}
