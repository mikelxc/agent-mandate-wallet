import { Suspense } from 'react';
import { AppFrame } from '../../../components/app-frame';
import { ArcOnboarding } from '../../../components/arc-onboarding';

export default function AddAgentPage() {
  return (
    <AppFrame active="connect">
      <div className="payments-heading">
        <div>
          <h1>Add an agent</h1>
          <p>
            Create an agent wallet or verify an existing one, then connect your
            app.
          </p>
        </div>
      </div>
      <Suspense fallback={<p>Loading agent setup…</p>}>
        <ArcOnboarding alwaysSetup initialStep={2} />
      </Suspense>
    </AppFrame>
  );
}
