'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArcWalletSetup } from './arc-wallet-setup';
export function ArcWalletPage() {
  const [account, setAccount] = useState('');
  return (
    <>
      <ArcWalletSetup onAccount={setAccount} />
      {account && (
        <p>
          Continue through <Link href="/?setup=1">setup</Link> to link this Arc
          wallet to your ENS identity and create an agent bearer token.
        </p>
      )}
    </>
  );
}
