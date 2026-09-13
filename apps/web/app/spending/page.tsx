import type { Metadata } from 'next';
import { AppFrame } from '../../components/app-frame';
import { AgentControl } from '../../components/agent-control';

export const metadata: Metadata = { title: 'Spending' };

export default function SpendingPage() {
  return (
    <AppFrame>
      <AgentControl />
    </AppFrame>
  );
}
