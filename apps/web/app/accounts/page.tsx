import { AppFrame } from '../../components/app-frame';
import { OwnedWalletManager } from '../../components/owned-wallet-manager';
import '../../components/agent-flows.css';
import './accounts.css';

export default function Accounts() {
  return (
    <AppFrame active="account">
      <section className="wl-agent-settings accounts-page">
        <div className="flow-heading">
          <span className="flow-eyebrow">YOUR ACCOUNT</span>
          <h1>Your agent wallets</h1>
          <p>
            A wallet for each agent. Your funds stay together, and you approve
            every payment.
          </p>
        </div>
        <OwnedWalletManager />
      </section>
    </AppFrame>
  );
}
