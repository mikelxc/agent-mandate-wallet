import { Suspense } from 'react';
import { ArcOnboarding } from '../components/arc-onboarding';
import { AppFrame } from '../components/app-frame';

export default function Home() {
  return (
    <AppFrame>
      <Suspense fallback={<p>Loading setup…</p>}>
        <ArcOnboarding />
      </Suspense>
    </AppFrame>
  );
}
