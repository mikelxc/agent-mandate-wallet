import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppFrame } from '../../components/app-frame';
import { OwnedAgentAccess } from '../../components/owned-agent-access';
export const metadata: Metadata = { title: 'Connect an agent' };

export default function Connect() {
  return (
    <AppFrame active="connect">
      <section className="agent-access-page">
        <div className="payments-heading">
          <div>
            <h1>Grant agent access</h1>
          </div>
        </div>
        <Suspense fallback={<p>Loading agent access…</p>}>
          <OwnedAgentAccess />
        </Suspense>
      </section>
    </AppFrame>
  );
}
