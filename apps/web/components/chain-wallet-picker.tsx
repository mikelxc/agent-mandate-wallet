'use client';

import { useState } from 'react';
import { Network, Check } from 'lucide-react';

// Only expose networks with an implemented, chain-guarded setup path.
const networks = [
  {
    network: 'Arc',
    name: 'Arc Testnet',
    detail: 'USDC payments · Test funds only',
  },
] as const;
export type AdditionalWalletNetwork = (typeof networks)[number]['network'];

export function ChainWalletPicker({
  value,
  onChange,
}: {
  value: AdditionalWalletNetwork;
  onChange: (network: AdditionalWalletNetwork) => void;
}) {
  const [search, setSearch] = useState('');
  const visible = networks.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase().trim()),
  );
  return (
    <fieldset className="chain-wallet-picker">
      <legend>Choose a chain</legend>
      {networks.length > 6 && (
        <label>
          Find a chain
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search networks"
          />
        </label>
      )}
      <div className="chain-wallet-options">
        {visible.map((item) => (
          <label
            key={item.network}
            className="chain-wallet-option"
            data-selected={value === item.network}
          >
            <input
              type="radio"
              name="additional-wallet-network"
              value={item.network}
              checked={value === item.network}
              onChange={() => onChange(item.network)}
            />
            <Network size={22} aria-hidden="true" />
            <span>
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
            {value === item.network && <Check size={17} aria-hidden="true" />}
          </label>
        ))}
        {!visible.length && <p>No matching chains.</p>}
      </div>
      <p>Each chain has its own wallet, ownership NFT and balance.</p>
    </fieldset>
  );
}
