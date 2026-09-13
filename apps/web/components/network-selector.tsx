'use client';

import { WayleaveSelect } from './wayleave-select';
import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useConnection, useSwitchChain } from 'wagmi';

const networks = {
  Sepolia: { id: 11155111, name: 'Sepolia', href: '/sepolia' },
  Arc: { id: 5042002, name: 'Arc Testnet', href: '/payments' },
} as const;

export function NetworkSelector({
  network,
}: {
  network: keyof typeof networks;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startTransition] = useTransition();
  const { address, chainId } = useConnection();
  const switchChain = useSwitchChain();
  const [error, setError] = useState('');
  const selected = networks[network];
  return (
    <div className="network-picker">
      <span className="network-picker-label">Wallet network</span>
      <WayleaveSelect
        label="Wallet network"
        badge
        value={network}
        disabled={navigating || switchChain.isPending}
        options={[
          {
            value: 'Sepolia',
            label: 'Sepolia',
            description: 'Sepolia wallet · ENSv2 naming',
          },
          {
            value: 'Arc',
            label: 'Arc testnet',
            description: 'Arc wallet · CCTP payments',
          },
          {
            value: 'Mainnet',
            label: 'Mainnet — coming soon',
            description: 'Not available yet',
            disabled: true,
          },
        ]}
        onValueChange={(next) => {
          if (next !== 'Sepolia' && next !== 'Arc') return;
          setError('');
          startTransition(() => router.push(pathname === '/accounts' ? `/accounts?network=${next.toLowerCase()}` : networks[next].href));
        }}
      />
      {address && chainId !== selected.id && (
        <button
          className="network-wallet-switch"
          type="button"
          disabled={switchChain.isPending}
          onClick={async () => {
            setError('');
            try {
              await switchChain.mutateAsync({ chainId: selected.id });
            } catch {
              setError(
                'Wallet network was not changed. Try again in your wallet.',
              );
            }
          }}
        >
          {switchChain.isPending
            ? 'Switching wallet…'
            : `Switch wallet to ${selected.name}`}
        </button>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
