'use client';

import { WayleaveSelect } from './wayleave-select';
import { useState } from 'react';
import { useConnection, useSwitchChain } from 'wagmi';

const networks = {
  Sepolia: { id: 11155111, name: 'Sepolia' },
  Arc: { id: 5042002, name: 'Arc Testnet' },
} as const;

export function NetworkSelector() {
  const { address, chainId } = useConnection();
  const switchChain = useSwitchChain();
  const [error, setError] = useState('');
  const network = !address
    ? 'disconnected'
    : chainId === networks.Arc.id
      ? 'Arc'
      : chainId === networks.Sepolia.id
        ? 'Sepolia'
        : 'unsupported';
  async function selectNetwork(next: string) {
    if (next !== 'Sepolia' && next !== 'Arc') return;
    setError('');
    try {
      await switchChain.mutateAsync({ chainId: networks[next].id });
    } catch {
      setError('Wallet network was not changed. Try again in your wallet.');
    }
  }
  return (
    <div className="network-picker">
      <span className="network-picker-label">Wallet network</span>
      <WayleaveSelect
        label="Wallet network"
        badge
        value={network}
        disabled={!address || switchChain.isPending}
        options={[
          ...(!address
            ? [
                {
                  value: 'disconnected',
                  label: 'No wallet connected',
                  disabled: true,
                },
              ]
            : network === 'unsupported'
              ? [
                  {
                    value: 'unsupported',
                    label: `Chain ${chainId}`,
                    disabled: true,
                  },
                ]
              : []),
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
        onValueChange={selectNetwork}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
