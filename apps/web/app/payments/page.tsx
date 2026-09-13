import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppFrame } from '../../components/app-frame';
import { CheckoutPromo } from '../../components/checkout-promo';

export const metadata: Metadata = { title: 'Agent checkout' };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // Preserve issued checkout links, but review every transaction in Spending.
  if (
    query.operation ||
    query.request ||
    query.purchase ||
    query.view === 'arc'
  ) {
    const params = new URLSearchParams();
    for (const key of ['operation', 'request', 'purchase', 'view']) {
      const value = query[key];
      if (typeof value === 'string') params.set(key, value);
      else if (value?.[0]) params.set(key, value[0]);
    }
    redirect(`/spending?${params}`);
  }
  return (
    <AppFrame active="payments" publicFacing>
      <CheckoutPromo />
    </AppFrame>
  );
}
