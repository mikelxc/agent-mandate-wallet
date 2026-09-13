import Link from 'next/link';
import { AppFrame } from '../../components/app-frame';
import { AgentControl } from '../../components/agent-control';
export default function SepoliaPage() {
  return (
    <AppFrame network="Sepolia">
      <div style={{ maxWidth: 1120, margin: '24px auto', padding: '0 28px' }}>
        <p>
          Your Sepolia NFT controls your Sepolia wallet.{' '}
          <Link href="/wallets/setup">Mint wallets on Sepolia and Arc →</Link>
        </p>
      </div>
      <AgentControl />
    </AppFrame>
  );
}
