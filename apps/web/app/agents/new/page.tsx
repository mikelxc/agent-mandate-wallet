import { Suspense } from 'react';
import { AppFrame } from '../../../components/app-frame';
import { PortableIdentityPanel } from '../../../components/portable-identity';

export default function AddAgentPage() {
  return (
    <AppFrame active="connect">
      <div className="payments-heading">
        <div>
          <h1>Add an agent</h1>
          <p>
            Connect another app to a wallet you already own. Choose its access
            and session length.
          </p>
        </div>
      </div>
      <Suspense fallback={<p>Loading agent setup…</p>}>
        <PortableIdentityPanel connectionOnly hideWalletCreation />
      </Suspense>
    </AppFrame>
  );
}
