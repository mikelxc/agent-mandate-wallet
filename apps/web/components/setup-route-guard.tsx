'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useConnection, usePublicClient } from 'wagmi';
import { sepolia } from 'viem/chains';
import { kernelAccountFactoryAbi, sepoliaDeployment } from '@mandate/sdk';

export function SetupRouteGuard({
  connectionsOnly,
  onDashboardChange,
  onOperationChange,
}: {
  connectionsOnly: boolean;
  onDashboardChange: (show: boolean) => void;
  onOperationChange: (operation: string) => void;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { address, isConnected } = useConnection();
  const client = usePublicClient({ chainId: sepolia.id });
  const query = searchParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(query);
    onDashboardChange(connectionsOnly || !params.has('setup'));
    onOperationChange(connectionsOnly ? '' : (params.get('operation') ?? ''));
    if (!params.has('setup') || !isConnected || !address || !client) return;

    let cancelled = false;
    // Read the deployed NFAT registry, independent of login or MCP credentials.
    void client
      .readContract({
        address: sepoliaDeployment.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'balanceOf',
        args: [address],
      })
      .then((balance) => {
        if (cancelled || balance === 0n) return;
        params.delete('setup');
        const remaining = params.toString();
        onDashboardChange(true);
        router.replace(
          `${pathname}${remaining ? `?${remaining}` : ''}${window.location.hash}`,
          { scroll: false },
        );
      })
      .catch(() => {
        // An unavailable RPC is not evidence of ownership; keep setup accessible.
      });
    return () => {
      cancelled = true;
    };
  }, [
    address,
    client,
    connectionsOnly,
    isConnected,
    onDashboardChange,
    onOperationChange,
    pathname,
    query,
    router,
  ]);

  return null;
}
