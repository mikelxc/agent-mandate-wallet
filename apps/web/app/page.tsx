import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ArcOnboarding } from '../components/arc-onboarding';
import { AppFrame } from '../components/app-frame';
import { InitialSetupGuard } from '../components/initial-setup-guard';

type HomeProps = {
  searchParams: Promise<{
    operation?: string | string[];
    signin?: string | string[];
    setup?: string | string[];
  }>;
};

export async function generateMetadata({
  searchParams,
}: HomeProps): Promise<Metadata> {
  const { signin, operation, setup } = await searchParams;
  if (signin !== undefined)
    return { title: { absolute: 'Sign in · Wayleave' } };
  if (operation) return { title: { absolute: 'Review payment · Wayleave' } };
  if (setup !== undefined)
    return { title: { absolute: 'Set up your agent · Wayleave' } };
  return { title: { absolute: 'Wayleave — Agent wallets, owned by you' } };
}

export default async function Home({ searchParams }: HomeProps) {
  const { operation } = await searchParams;
  // MCP approval links identify the request, independently of wallet network.
  if (operation) {
    const id = Array.isArray(operation) ? operation[0] : operation;
    redirect(`/spending?${new URLSearchParams({ operation: id })}`);
  }

  return (
    <AppFrame>
      <Suspense fallback={<p>Loading setup…</p>}>
        <InitialSetupGuard>
          <ArcOnboarding />
        </InitialSetupGuard>
      </Suspense>
    </AppFrame>
  );
}
