import { AppFrame } from '../../components/app-frame';
import { KernelWorkspace } from '../../components/kernel-workspace';
import { WalletCards, ShieldCheck } from 'lucide-react';

export default function Accounts() {
  return (
    <AppFrame active="account">
      <section className="account-page">
        <div className="account-page-heading">
          <span className="account-page-icon">
            <WalletCards size={28} />
          </span>
          <h1>Your account.</h1>
          <p>Add test funds and manage spending allowances.</p>
        </div>
        <div className="account-notice">
          <ShieldCheck size={20} />
          <div>
            <strong>Test funds only.</strong>
            <p>Payments use Sepolia and need your wallet signature.</p>
          </div>
        </div>
        <details className="account-tools">
          <summary>Funding &amp; account settings</summary>
          <KernelWorkspace />
        </details>
      </section>
    </AppFrame>
  );
}
