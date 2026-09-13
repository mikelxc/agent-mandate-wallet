'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConnection, usePublicClient } from 'wagmi';
import { arcTestnet, sepolia } from 'viem/chains';
import { isAddress } from 'viem';
import { kernelAccountFactoryAbi, sepoliaDeployment } from '@mandate/sdk';

/** Initial onboarding only; dedicated creation and connection pages stay accessible. */
export function InitialSetupGuard({ children }: { children: ReactNode }) {
  const { address } = useConnection();
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const arcClient = usePublicClient({ chainId: arcTestnet.id });
  const router = useRouter();
  const [checked, setChecked] = useState<{
    owner: string;
    state: 'new' | 'existing' | 'error';
  }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!address || !sepoliaClient || !arcClient) return;
    const controller = new AbortController();
    void Promise.allSettled([
      sepoliaClient.readContract({
        address: sepoliaDeployment.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'balanceOf',
        args: [address],
      }),
      (async () => {
        const response = await fetch('/gateway/crosschain/config', {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Arc configuration unavailable');
        const config = await response.json();
        if (!config.configured) return 0n;
        if (config.chainId !== arcTestnet.id || !isAddress(config.registry))
          throw new Error('Invalid Arc configuration');
        return arcClient.readContract({
          address: config.registry,
          abi: kernelAccountFactoryAbi,
          functionName: 'balanceOf',
          args: [address],
        });
      })(),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      const existing = results.some(
        (result) => result.status === 'fulfilled' && result.value > 0n,
      );
      setChecked({
        owner: address,
        state: existing
          ? 'existing'
          : results.some((result) => result.status === 'rejected')
            ? 'error'
            : 'new',
      });
      if (existing) {
        const params = new URLSearchParams(window.location.search);
        params.delete('setup');
        router.replace(
          `/payments${params.size ? `?${params}` : ''}${window.location.hash}`,
        );
      }
    });
    return () => controller.abort();
  }, [address, sepoliaClient, arcClient, router, retry]);
  const state = checked?.owner === address ? checked?.state : undefined;
  const blocked = !!address && state !== 'new';
  return (
    <>
      {blocked && (
        <section>
          <p role="status">
            {state === 'error'
              ? 'Could not check your existing wallets.'
              : state === 'existing'
                ? 'Opening your payments…'
                : 'Checking your existing wallets…'}
          </p>
          {state === 'error' && (
            <button onClick={() => setRetry((value) => value + 1)}>
              Retry wallet check
            </button>
          )}
          <Link href="/payments">Open payments</Link>
        </section>
      )}
      <div hidden={blocked}>{children}</div>
    </>
  );
}
