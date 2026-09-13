import { Suspense } from 'react';
import { AppFrame } from '../../components/app-frame';
import { Payments } from '../../components/crosschain-payments';

export default function PaymentsPage() {
  return (
    <AppFrame active="payments" network="Arc">
      <Suspense fallback={<p>Loading payments…</p>}>
        <Payments />
      </Suspense>
    </AppFrame>
  );
}
