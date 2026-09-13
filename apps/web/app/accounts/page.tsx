import { AppFrame } from '../../components/app-frame';
import Link from 'next/link';
import { OwnedWalletManager } from '../../components/owned-wallet-manager';
export default function Accounts() {
  return (
    <AppFrame active="account">
      <section className="account-page">
        <div className="account-page-heading">
          <h1>Wallet access</h1>
          <p>
            See what your agents’ spending wallets can draw from your balance.
          </p>
        </div>
        <p>
          Each ownership NFT controls a wallet on its own chain.{' '}
          <Link href="/wallets/setup">Mint on Sepolia and Arc →</Link>
        </p>
        <OwnedWalletManager />
      </section>
    </AppFrame>
  );
}
