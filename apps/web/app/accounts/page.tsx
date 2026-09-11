import { AppFrame } from '../../components/app-frame';
import { KernelWorkspace } from '../../components/kernel-workspace';
export default function Accounts() {
  return (
    <AppFrame active="account">
      <section className="account-page">
        <div className="account-page-heading">
          <h1>Wallet access</h1>
          <p>
            See what your agents’ spending wallets can draw from your balance.
          </p>
        </div>
        <KernelWorkspace compact />
      </section>
    </AppFrame>
  );
}
