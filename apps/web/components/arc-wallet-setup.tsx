'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useConnection,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';
import { arcTestnet, sepolia } from 'viem/chains';
import { isAddress, isAddressEqual, type Address, type Hex } from 'viem';
import {
  kernelAccountFactoryAbi,
  nFTOwnerValidatorAbi,
  validLabel,
  sepoliaDeployment,
  agentEnsName,
} from '@mandate/sdk';
import { gatewayResponse } from '../lib/gateway-response';

type Configuration = {
  configured: boolean;
  chainId: number;
  registry?: Address;
  validator?: Address;
};
export function ArcWalletSetup({
  onAccount,
}: {
  onAccount: (account: Address) => void;
}) {
  return <ChainWalletSetup network="Arc" onAccount={onAccount} />;
}
export function ChainWalletSetup({
  network,
  onAccount,
}: {
  network: 'Arc' | 'Sepolia';
  onAccount: (account: Address) => void;
}) {
  return <WalletSetup key={network} network={network} onAccount={onAccount} />;
}
function WalletSetup({
  network,
  onAccount,
}: {
  network: 'Arc' | 'Sepolia';
  onAccount: (account: Address) => void;
}) {
  const chain = network === 'Arc' ? arcTestnet : sepolia;
  const storagePrefix =
    network === 'Arc' ? 'wayleave:arc-create' : 'wayleave:sepolia-create';
  const { address } = useConnection();
  const client = usePublicClient({ chainId: chain.id });
  const switcher = useSwitchChain();
  const write = useWriteContract();
  const [config, setConfig] = useState<Configuration>();
  const [label, setLabel] = useState('');
  const [existing, setExisting] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [pending, setPending] = useState<{
    hash: Hex;
    id: string;
    account: Address;
  }>();
  const owner = useRef(address);
  owner.current = address;
  useEffect(() => {
    owner.current = address;
    return () => {
      owner.current = undefined;
    };
  }, [address]);
  const lock = useRef(false);
  useEffect(() => {
    if (network === 'Sepolia') {
      setConfig({
        configured: true,
        chainId: sepolia.id,
        registry: sepoliaDeployment.registry,
        validator: sepoliaDeployment.validator,
      });
      return;
    }
    const controller = new AbortController();
    fetch('/gateway/crosschain/config', { signal: controller.signal })
      .then(gatewayResponse<Configuration>)
      .then(setConfig)
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Arc configuration is unavailable. Reload to retry.');
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setResult('');
    setError('');
    setPending(undefined);
    setExisting('');
    if (address) {
      try {
        const saved = JSON.parse(
          localStorage.getItem(`${storagePrefix}:${address.toLowerCase()}`) ??
            'null',
        );
        if (
          saved &&
          /^0x[0-9a-fA-F]{64}$/.test(saved.hash) &&
          /^\d+$/.test(saved.id) &&
          isAddress(saved.account)
        )
          setPending(saved);
      } catch {
        /* Storage is optional. */
      }
    }
  }, [address]);
  useEffect(() => {
    if (!address || !config?.configured) return;
    try {
      const saved = localStorage.getItem(
        `${storagePrefix}:verified:${address.toLowerCase()}`,
      );
      if (saved && isAddress(saved)) void verify(saved).catch(() => {});
    } catch {
      /* An unavailable saved address is not proof of ownership. */
    }
  }, [address, config]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wallet setup failed');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function context() {
    if (
      !address ||
      !client ||
      !config?.configured ||
      config.chainId !== chain.id ||
      !config.registry ||
      !isAddress(config.registry)
    )
      throw new Error(
        'Connect your wallet and wait for the selected chain deployment configuration.',
      );
    return { currentOwner: address, client, registry: config.registry };
  }
  async function verify(account: Address) {
    const { currentOwner, client, registry } = context();
    if ((await client.getChainId()) !== chain.id)
      throw new Error('Unexpected RPC network');
    if (!config?.validator || !isAddress(config.validator))
      throw new Error('Selected chain validator is not configured.');
    const [boundRegistry, id] = await client.readContract({
      address: config.validator,
      abi: nFTOwnerValidatorAbi,
      functionName: 'bindings',
      args: [account],
    });
    if (!isAddressEqual(boundRegistry, registry))
      throw new Error('Wallet is not bound to the selected chain registry.');
    const [registered, holder, code] = await Promise.all([
      client.readContract({
        address: registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'accountOf',
        args: [id],
      }),
      client.readContract({
        address: registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'ownerOf',
        args: [id],
      }),
      client.getCode({ address: account }),
    ]);
    if (!isAddressEqual(registered, account) || !code || code === '0x')
      throw new Error(
        'No deployed wallet was found in the selected chain registry.',
      );
    if (!isAddressEqual(holder, currentOwner))
      throw new Error(`This ${network} wallet belongs to a different owner.`);
    if (owner.current !== currentOwner)
      throw new Error('Connected wallet changed. Verify again.');
    if (network === 'Sepolia') {
      const walletLabel = await client.readContract({
        address: registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'labelOf',
        args: [id],
      });
      const resolved = await client.getEnsAddress({
        name: agentEnsName(walletLabel),
      });
      if (!resolved || !isAddressEqual(resolved, account))
        throw new Error('ENSv2 name does not resolve to this Sepolia wallet.');
    }
    if (owner.current !== currentOwner)
      throw new Error('Connected wallet changed. Verify again.');
    try {
      localStorage.setItem(
        `${storagePrefix}:verified:${currentOwner.toLowerCase()}`,
        account,
      );
    } catch {
      /* Storage is optional. */
    }
    setResult(`${network} wallet verified: ${account}`);
    onAccount(account);
  }
  async function reconcile(saved: NonNullable<typeof pending>) {
    const { currentOwner, client, registry } = context();
    const tx = await client.getTransaction({ hash: saved.hash });
    if (
      !tx.to ||
      !isAddressEqual(tx.to, registry) ||
      !isAddressEqual(tx.from, currentOwner)
    )
      throw new Error(
        'Creation transaction does not match this owner and registry.',
      );
    const receipt = await client.waitForTransactionReceipt({
      hash: saved.hash,
    });
    if (receipt.status !== 'success') {
      localStorage.removeItem(`${storagePrefix}:${currentOwner.toLowerCase()}`);
      setPending(undefined);
      throw new Error(
        'Wallet creation reverted. You can retry with a fresh prediction.',
      );
    }
    const registered = await client.readContract({
      address: registry,
      abi: kernelAccountFactoryAbi,
      functionName: 'accountOf',
      args: [BigInt(saved.id)],
    });
    if (!isAddressEqual(registered, saved.account))
      throw new Error('Created wallet differs from the reviewed prediction.');
    await verify(saved.account);
    localStorage.removeItem(`${storagePrefix}:${currentOwner.toLowerCase()}`);
    setPending(undefined);
  }
  return (
    <section
      className="flow-surface arc-wallet-setup"
      aria-label={`${network} wallet setup`}
    >
      <h2>Your wallet lives on {network}.</h2>
      <p>
        Create an NFT-controlled payment wallet. Your wallet holds its ownership
        NFT on this chain; every payment still needs your approval. An NFT on
        another chain does not control this wallet.
      </p>
      {!config?.configured && (
        <p role="status">
          {config
            ? 'Arc deployment is not configured on this server.'
            : 'Checking Arc deployment…'}
        </p>
      )}
      <label>
        Wallet label
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="research-desk"
          maxLength={32}
        />
      </label>
      <p className="flow-note">
        {network === 'Arc'
          ? '3–32 lowercase letters, numbers or hyphens. This labels the Arc wallet; your ENS name is registered separately on Sepolia. Creation uses native test USDC for gas.'
          : `3–32 lowercase letters, numbers or hyphens. Minting also registers ${agentEnsName(label || 'your-name')} for this Sepolia wallet. Creation uses Sepolia ETH for gas.`}
      </p>
      <button
        className="primary"
        disabled={
          busy ||
          !!pending ||
          !address ||
          !config?.configured ||
          !validLabel(label)
        }
        onClick={() =>
          void run(async () => {
            const { currentOwner, client, registry } = context();
            if ((await client.getChainId()) !== chain.id)
              throw new Error('Unexpected RPC network');
            await switcher.mutateAsync({ chainId: chain.id });
            const [id, account] = await client.readContract({
              address: registry,
              abi: kernelAccountFactoryAbi,
              functionName: 'nextAccountAddress',
            });
            const simulation = await client.simulateContract({
              account: currentOwner,
              address: registry,
              abi: kernelAccountFactoryAbi,
              functionName: 'createAccountChecked',
              args: [label, id],
            });
            if (owner.current !== currentOwner)
              throw new Error('Connected wallet changed');
            const hash = await write.mutateAsync({
              ...simulation.request,
              chainId: chain.id,
            });
            const saved = { hash, id: id.toString(), account };
            // Save immediately so an RPC timeout never encourages a second deployment.
            try {
              localStorage.setItem(
                `${storagePrefix}:${currentOwner.toLowerCase()}`,
                JSON.stringify(saved),
              );
            } catch {
              /* Keep in memory if storage is disabled. */
            }
            setPending(saved);
            await reconcile(saved);
          })
        }
      >
        {busy
          ? 'Waiting for wallet…'
          : `Create wallet on ${network === 'Arc' ? 'Arc Testnet' : 'Sepolia'}`}
      </button>
      {pending && (
        <p role="status">
          Creation submitted.{' '}
          <a
            href={`${chain.blockExplorers.default.url}/tx/${pending.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
          </a>{' '}
          <button
            disabled={busy}
            onClick={() => void run(() => reconcile(pending))}
          >
            Check creation receipt
          </button>
        </p>
      )}
      <details>
        <summary>Use an existing {network} wallet</summary>
        <label>
          {network} wallet address
          <input
            value={existing}
            onChange={(e) => setExisting(e.target.value)}
            placeholder="0x…"
          />
        </label>
        <button
          disabled={busy || !isAddress(existing)}
          onClick={() => void run(() => verify(existing as Address))}
        >
          Verify existing {network} wallet
        </button>
      </details>
      {result && (
        <p role="status" style={{ overflowWrap: 'anywhere' }}>
          {result}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
