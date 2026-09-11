'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection, useSwitchChain } from 'wagmi';

const networks = {
  Sepolia: { id: 11155111, name: 'Sepolia', href: '/' },
  Arc: { id: 5042002, name: 'Arc Testnet', href: '/crosschain' },
} as const;

export function NetworkSelector({ network }: { network: keyof typeof networks }) {
  const router = useRouter();
  const [navigating, startTransition] = useTransition();
  const { address, chainId } = useConnection();
  const switchChain = useSwitchChain();
  const [error, setError] = useState('');
  const selected = networks[network];
  return <div className="network-picker">
    <label htmlFor="payment-network">Payment network</label>
    <select id="payment-network" value={network} disabled={navigating || switchChain.isPending}
      onChange={event => {
        const next = event.target.value;
        if (next !== 'Sepolia' && next !== 'Arc') return;
        setError('');
        startTransition(() => router.push(networks[next].href));
      }}>
      <option value="Sepolia">Sepolia</option>
      <option value="Arc">Arc Testnet</option>
    </select>
    {address && chainId !== selected.id && <button type="button" disabled={switchChain.isPending} onClick={async () => {
      setError('');
      try { await switchChain.mutateAsync({ chainId: selected.id }); }
      catch { setError('Wallet network was not changed. Try again in your wallet.'); }
    }}>{switchChain.isPending ? 'Switching wallet…' : `Switch wallet to ${selected.name}`}</button>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
