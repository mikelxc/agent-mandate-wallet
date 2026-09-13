'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChainWalletSetup } from './chain-wallet-setup';
export function ArcWalletPage() {
  const [account, setAccount] = useState('');
  return (
    <>
      <ChainWalletSetup network="Arc" onAccount={setAccount} />
      {account && (
        <p>
          Continue through <Link href="/?setup=1">setup</Link> to link this Arc
          wallet to your ENS identity and create an agent bearer token.
        </p>
      )}
    </>
  );
}
