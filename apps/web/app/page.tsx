import { Suspense } from 'react';
import { AgentControl } from '../components/agent-control';
import { ArcOnboarding } from '../components/arc-onboarding';
import { AppFrame } from '../components/app-frame';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ operation?: string | string[] }>;
}) {
  const { operation } = await searchParams;
  // MCP approval links identify the request, independently of wallet network.
  if (operation) {
    return (
      <AppFrame>
        <AgentControl />
      </AppFrame>
    );
  }
  return (
    <AppFrame>
      <Suspense fallback={<p>Loading setup…</p>}>
        <ArcOnboarding />
      </Suspense>
    </AppFrame>
  );
}
