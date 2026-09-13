'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useConnection,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';
import { arcTestnet, sepolia } from 'viem/chains';
import {
  erc20Abi,
  formatUnits,
  isAddress,
  isAddressEqual,
  parseUnits,
  type Address,
  type PublicClient,
} from 'viem';
import {
  arcCctpRoute,
  entryPointAbi,
  kernelAccountFactoryAbi,
  sepoliaDeployment,
} from '@mandate/sdk';
import {
  discoverOwnedWallets,
  type OwnedWallet,
  type WalletDeployment,
} from '../lib/owned-wallets';
import { gatewayResponse } from '../lib/gateway-response';
import { WayleaveSelect } from './wayleave-select';
import { Plus, RefreshCw, Wallet } from 'lucide-react';

function CreateWalletLink() {
  return (
    <Link className="primary account-create-link" href="/accounts/new">
      <Plus size={16} aria-hidden="true" /> Create new wallet
    </Link>
  );
}

export function OwnedWalletManager({ network }: { network?: string }) {
  const { address } = useConnection();
  return address ? (
    <WalletInventory
      key={`${address.toLowerCase()}:${network}`}
      owner={address}
      network={network}
    />
  ) : (
    <section className="flow-surface wallet-manager">
      <div className="wallet-toolbar">
        <h2>Wallet access</h2>
        <div className="wallet-toolbar-actions">
          <button className="secondary" disabled>
            <RefreshCw size={15} aria-hidden="true" /> Refresh wallets
          </button>
          <CreateWalletLink />
        </div>
      </div>
      <div className="wallet-empty">
        <Wallet size={28} aria-hidden="true" />
        <h3>Your wallets, in one place</h3>
        <p>
          Connect your wallet to see its ownership NFTs across Sepolia and Arc.
        </p>
        <Link href="/">Sign in to your account →</Link>
      </div>
    </section>
  );
}
function WalletInventory({
  owner,
  network,
}: {
  owner: Address;
  network?: string;
}) {
  const router = useRouter();
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const arcClient = usePublicClient({ chainId: arcTestnet.id });
  const [wallets, setWallets] = useState<OwnedWallet[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const sepoliaConfig: WalletDeployment = {
      ...sepoliaDeployment,
      chainId: sepolia.id,
      network: 'Sepolia',
      explorer: sepolia.blockExplorers.default.url,
      gasSymbol: 'Sepolia ETH',
    };
    async function load() {
      const results = await Promise.allSettled([
        (async () => {
          if (!sepoliaClient) throw new Error('RPC unavailable');
          return discoverOwnedWallets(
            sepoliaClient as PublicClient,
            sepoliaConfig,
            owner,
            controller.signal,
          );
        })(),
        (async () => {
          const config = await fetch('/gateway/crosschain/config', {
            signal: controller.signal,
          }).then(
            gatewayResponse<{
              configured: boolean;
              chainId: number;
              registry: Address;
              validator: Address;
              entryPoint: Address;
            }>,
          );
          if (
            !config.configured ||
            config.chainId !== arcTestnet.id ||
            ![config.registry, config.validator, config.entryPoint].every(
              (value) => value && isAddress(value),
            )
          )
            throw new Error('Deployment configuration unavailable');
          if (!arcClient) throw new Error('RPC unavailable');
          return discoverOwnedWallets(
            arcClient as PublicClient,
            {
              ...config,
              network: 'Arc Testnet',
              token: arcCctpRoute.sourceToken,
              explorer: arcTestnet.blockExplorers.default.url,
              gasSymbol: 'USDC',
            },
            owner,
            controller.signal,
          );
        })(),
      ]);
      if (controller.signal.aborted) return;
      const found = results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      );
      setWallets(found);
      setErrors(
        results.flatMap((result, i) =>
          result.status === 'rejected'
            ? [
                `${i === 0 ? 'Sepolia' : 'Arc'} wallets could not be loaded: ${result.reason instanceof Error ? result.reason.message : 'RPC unavailable'}`,
              ]
            : [],
        ),
      );
      const requested = new URLSearchParams(window.location.search).get(
        'account',
      );
      setSelected(
        (previous) =>
          found.find((wallet) => wallet.key === previous)?.key ??
          found.find(
            (wallet) =>
              wallet.account.toLowerCase() === requested?.toLowerCase() &&
              (!network ||
                (wallet.chainId === sepolia.id) === (network === 'sepolia')),
          )?.key ??
          found.find(
            (wallet) =>
              (wallet.chainId === sepolia.id) === (network === 'sepolia'),
          )?.key ??
          found[0]?.key ??
          '',
      );
      setLoading(false);
    }
    void load();
    return () => controller.abort();
  }, [owner, sepoliaClient, arcClient, revision, network]);
  const wallet = wallets.find((item) => item.key === selected);
  return (
    <section className="flow-surface wallet-manager">
      <div className="wallet-toolbar">
        <div>
          <h2>Wallet access</h2>
          <p>Ownership NFTs on Sepolia and Arc Testnet</p>
        </div>
        <div className="wallet-toolbar-actions">
          <button
            className="secondary"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setWallets([]);
              setErrors([]);
              setRevision((value) => value + 1);
            }}
          >
            <RefreshCw size={15} aria-hidden="true" /> Refresh wallets
          </button>
          <CreateWalletLink />
        </div>
      </div>
      {loading && (
        <output>Loading ownership NFTs across supported chains…</output>
      )}
      {errors.map((error) => (
        <p role="alert" key={error}>
          {error}
        </p>
      ))}
      {!loading && !wallets.length && (
        <p>
          {errors.length
            ? 'No wallets found on the chains that could be checked.'
            : 'No ownership NFTs found for this account.'}{' '}
          <span>
            Each new agent wallet comes with an ownership NFT held by you.
          </span>
        </p>
      )}
      {!!wallets.length && (
        <div className="wallet-selection">
        <div className="wallet-selection-heading"><h3>Choose an agent wallet</h3><span>{wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'}</span></div>
        <WayleaveSelect
          label="Spending wallet"
          createAction={{ href: '/accounts/new', label: 'Create new wallet' }}
          value={selected}
          onValueChange={(value) => {
            setSelected(value);
            const next = wallets.find((item) => item.key === value);
            if (next)
              router.replace(
                `/accounts?network=${next.chainId === sepolia.id ? 'sepolia' : 'arc'}&account=${next.account}`,
                { scroll: false },
              );
          }}
          options={wallets.map((item) => ({
            value: item.key,
            label: `${item.name} · ${item.network} · #${item.id}`,
            description: item.account,
          }))}
        />
        </div>
      )}
      {wallet && (
        <WalletSettings
          key={wallet.key}
          wallet={wallet}
          owner={owner}
          client={
            (wallet.chainId === sepolia.id
              ? sepoliaClient
              : arcClient) as PublicClient
          }
        />
      )}
    </section>
  );
}
function WalletSettings({
  wallet,
  owner,
  client,
}: {
  wallet: OwnedWallet;
  owner: Address;
  client: PublicClient;
}) {
  const { address } = useConnection();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const switcher = useSwitchChain();
  const write = useWriteContract();
  const [details, setDetails] = useState<{
    balance: bigint;
    allowance: bigint;
    gas: bigint;
  }>();
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      client.readContract({
        address: wallet.token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
      }),
      client.readContract({
        address: wallet.token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, wallet.account],
      }),
      client.readContract({
        address: wallet.entryPoint,
        abi: entryPointAbi,
        functionName: 'balanceOf',
        args: [wallet.account],
      }),
    ])
      .then(([balance, allowance, gas]) => {
        if (!cancelled) setDetails({ balance, allowance, gas });
      })
      .catch(() => {
        if (!cancelled)
          setMessage('Could not load wallet settings. Refresh to retry.');
      });
    return () => {
      cancelled = true;
    };
  }, [client, wallet, owner, revision]);
  async function updateAccess(revoke: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const cap = revoke ? 0n : parseUnits(budget, 6);
      if (
        !revoke &&
        (!/^\d+(\.\d{1,6})?$/.test(budget) ||
          cap <= 0n ||
          cap >= 2n ** 256n - 1n)
      )
        throw new Error(
          'Enter a positive, finite USDC limit with at most six decimal places.',
        );
      await switcher.mutateAsync({ chainId: wallet.chainId });
      const holder = await client.readContract({
        address: wallet.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'ownerOf',
        args: [BigInt(wallet.id)],
      });
      if (
        !active.current ||
        !address ||
        !isAddressEqual(address, owner) ||
        !isAddressEqual(holder, owner)
      )
        throw new Error('Wallet ownership changed. Refresh wallets.');
      const hash = await write.mutateAsync({
        account: owner,
        chainId: wallet.chainId,
        address: wallet.token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [wallet.account, cap],
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success')
        throw new Error('Spending access transaction reverted.');
      setMessage(
        revoke ? 'Spending access removed.' : 'Spending access updated.',
      );
      setRevision((value) => value + 1);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not update access.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wallet-settings">
      <h2>{wallet.name} settings</h2>
      <p>
        {wallet.network} · Ownership NFT #{wallet.id}
      </p>
      <p className="wallet-address">
        <a
          href={`${wallet.explorer}/address/${wallet.account}`}
          target="_blank"
          rel="noreferrer"
        >
          {wallet.account} ↗
        </a>
      </p>
      <dl className="wallet-balances">
        <div>
          <dt>Your balance</dt>
          <dd>
            <span className="wallet-amount">{details ? formatUnits(details.balance, 6) : '…'}</span>{' '}
            <span className="wallet-currency">{wallet.chainId === sepolia.id ? 'demo USDC' : 'USDC'}</span>
          </dd>
        </div>
        <div>
          <dt>This wallet can access</dt>
          <dd><span className="wallet-amount">{details ? formatUnits(details.allowance, 6) : '…'}</span>{' '}<span className="wallet-currency">USDC</span></dd>
        </div>
        <div>
          <dt>Reserved for network fees</dt>
          <dd>
            <span className="wallet-amount">{details ? formatUnits(details.gas, 18) : '…'}</span>{' '}<span className="wallet-currency">{wallet.gasSymbol}</span>
          </dd>
        </div>
      </dl>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void updateAccess(true)}
      >
        Remove spending access
      </button>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => {
          setDetails(undefined);
          setMessage('');
          setRevision((value) => value + 1);
        }}
      >
        Refresh settings
      </button>
      <details className="wallet-allowance">
        <summary>Change spending access</summary>
        <p>
          Set the total USDC this wallet can draw from your balance. Each
          payment still requires your signature.
        </p>
        <label>
          Maximum access · USDC
          <input
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void updateAccess(false)}
        >
          Update access
        </button>
      </details>
      <output>
        {busy ? 'Waiting for your wallet and network confirmation…' : message}
      </output>
    </div>
  );
}
