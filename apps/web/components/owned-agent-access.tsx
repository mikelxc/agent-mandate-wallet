'use client';
import { useEffect, useState } from 'react';
import { useConnection, useConnect, useConnectors, usePublicClient } from 'wagmi';
import { useSearchParams, useRouter } from 'next/navigation';
import { arcTestnet, sepolia } from 'viem/chains';
import { isAddress, type Address, type PublicClient } from 'viem';
import { agentEnsName, arcCctpRoute, sepoliaDeployment } from '@mandate/sdk';
import { discoverOwnedWallets, type OwnedWallet } from '../lib/owned-wallets';
import { gatewayResponse } from '../lib/gateway-response';
import { WayleaveSelect } from './wayleave-select';
import { AgentAccessFlow } from './agent-access-flow';

export function OwnedAgentAccess() {
  const { address } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  if (!address) return <div className="flow-surface">
    <h2>Choose from your wallets</h2>
    <p>Connect your owner wallet to load its ENS names and agent wallets.</p>
    {connectors.map(connector => <button key={connector.uid} disabled={connect.isPending}
      onClick={() => connect.mutate({ connector })}>Connect {connector.name}</button>)}
    {connect.error && <p role="alert">{connect.error.message}</p>}
  </div>;
  return <OwnedAccessPicker key={address.toLowerCase()} owner={address} />;
}
function OwnedAccessPicker({ owner }: { owner: Address }) {
  const params = useSearchParams();
  const router = useRouter();
  const requestedAccount = params.get('account');
  const requestedChain = params.get('chainId');
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const arcClient = usePublicClient({ chainId: arcTestnet.id });
  const [wallets, setWallets] = useState<OwnedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  const [started, setStarted] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [selectedArc, setSelectedArc] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setStarted(false); setErrors([]); setSelectedArc(''); setChoosing(false);
    void Promise.allSettled([
      (async () => {
        if (!sepoliaClient) throw new Error('Sepolia RPC unavailable');
        return discoverOwnedWallets(sepoliaClient as PublicClient, { ...sepoliaDeployment,
          network: 'Sepolia', explorer: sepolia.blockExplorers.default.url, gasSymbol: 'Sepolia ETH' }, owner, controller.signal);
      })(),
      (async () => {
        const config = await fetch('/gateway/crosschain/config', { signal: controller.signal }).then(gatewayResponse<{
          configured: boolean; chainId: number; registry: Address; validator: Address; entryPoint: Address;
        }>);
        if (!config.configured || config.chainId !== arcTestnet.id || ![config.registry, config.validator, config.entryPoint].every(value => value && isAddress(value)))
          throw new Error('Arc deployment unavailable');
        if (!arcClient) throw new Error('Arc RPC unavailable');
        return discoverOwnedWallets(arcClient as PublicClient, { ...config, network: 'Arc Testnet',
          token: arcCctpRoute.sourceToken, explorer: arcTestnet.blockExplorers.default.url, gasSymbol: 'USDC' }, owner, controller.signal);
      })(),
    ]).then(results => {
      if (controller.signal.aborted) return;
      const found = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      setWallets(found);
      setErrors(results.flatMap((result, i) => result.status === 'rejected' ? [`${i ? 'Arc' : 'Sepolia'} wallets could not be loaded. Retry to refresh ownership.`] : []));
      const requested = found.find(wallet => wallet.account.toLowerCase() === requestedAccount?.toLowerCase() && String(wallet.chainId) === requestedChain);
      const identities = found.filter(wallet => wallet.chainId === sepolia.id);
      setSelected((requested?.chainId === sepolia.id ? requested : identities.find(wallet => wallet.name === requested?.name) ?? identities[0])?.key ?? '');
      setLoading(false);
    });
    return () => controller.abort();
  }, [owner, sepoliaClient, arcClient, requestedAccount, requestedChain, revision]);
  if (loading) return <p role="status">Loading ENS names from your owned wallets…</p>;
  const identities = wallets.filter(wallet => wallet.chainId === sepolia.id);
  const requested = wallets.find(wallet => wallet.account.toLowerCase() === requestedAccount?.toLowerCase() && String(wallet.chainId) === requestedChain);
  if (requestedAccount && !requested) return <div className="flow-surface">
    <p role="alert">The selected wallet could not be verified as yours on that network.</p>
    <button onClick={() => setRevision(value => value + 1)}>Retry wallet lookup</button>
    <button onClick={() => router.replace('/connect')}>Choose another wallet</button>
  </div>;
  const identity = identities.find(wallet => wallet.key === selected);
  const matchingArc = wallets.filter(wallet => wallet.chainId === arcTestnet.id && wallet.name === identity?.name);
  const arcWallets = wallets.filter(wallet => wallet.chainId === arcTestnet.id);
  const arc = requested?.chainId === arcTestnet.id ? requested
    : arcWallets.find(wallet => wallet.account === selectedArc)
      ?? (matchingArc.length === 1 ? matchingArc[0] : arcWallets.length === 1 ? arcWallets[0] : undefined);
  return <>
    {errors.map(error => <p role="alert" key={error}>{error}</p>)}
    {!!errors.length && <button onClick={() => setRevision(value => value + 1)}>Retry wallet lookup</button>}
    {!!identities.length && <div className="flow-surface access-wallet-picker">
      {choosing ? <>
        <label>Wallet
          <WayleaveSelect label="Wallet" value={selected}
            onValueChange={value => { setSelected(value); setSelectedArc(''); }}
            options={identities.map(wallet => ({ value: wallet.key, label: agentEnsName(wallet.name), description: wallet.account }))} />
        </label>
        <button onClick={() => setChoosing(false)}>Use this wallet</button>
      </> : <>
        <strong>{identity ? agentEnsName(identity.name) : 'Choose a wallet'}</strong>
        {!started && <button onClick={() => requestedAccount ? router.replace('/connect') : setChoosing(true)}>Change wallet</button>}
      </>}
      {arc && !(choosing && arcWallets.length > 1) ? !started && <p>Arc account: {arc.account}</p> : !!arcWallets.length && <label>Arc wallet
        <WayleaveSelect label="Arc wallet" value={arc?.account ?? selectedArc} disabled={started}
          onValueChange={setSelectedArc} options={arcWallets.map(wallet => ({ value: wallet.account, label: wallet.name, description: wallet.account }))} />
      </label>}
    </div>}
    {!identities.length && <p>No owned Sepolia names were found. You can verify another ENS identity below.</p>}
    {!choosing && <AgentAccessFlow key={`${identity?.key ?? 'manual'}:${arc?.account ?? ''}`} restoreExisting
      initialName={identity ? agentEnsName(identity.name) : undefined} initialAccount={arc?.account}
      onProgress={progress => setStarted(progress.identity)} />}
  </>;
}
