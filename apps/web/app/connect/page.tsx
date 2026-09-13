import { AppFrame } from '../../components/app-frame';
import { Suspense } from 'react';
import { ArcOnboarding } from '../../components/arc-onboarding';

export default function Connect() {
  return (
    <AppFrame active="connect">
      <Suspense fallback={<p>Loading connections…</p>}>
        <ArcOnboarding alwaysSetup initialStep={4} />
      </Suspense>
    </AppFrame>
  );
}
