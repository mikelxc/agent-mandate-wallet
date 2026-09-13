import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppFrame } from '../../components/app-frame';
import { OperationsWorkspace } from '../../components/operations-workspace';

export const metadata: Metadata = { title: 'Spending' };

export default function SpendingPage() {
  return (
    <AppFrame>
      <Suspense fallback={<p>Loading spending…</p>}>
        <OperationsWorkspace />
      </Suspense>
    </AppFrame>
  );
}
