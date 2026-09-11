'use client';
import { useState } from 'react';
import { useConnection, useConnect, useConnectors, useSignMessage, useWriteContract, usePublicClient, useSwitchChain } from 'wagmi';
import { portableIdentityDeployment, identityProofMessage, type PortableIdentity, type IdentityProof } from '@mandate/sdk';
import Link from 'next/link';
import { isAddress, zeroAddress } from 'viem';
import { wayleaveAgentRegistryAbi } from '@mandate/sdk';
async function api<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`/gateway/identity/${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.error ?? 'Identity request failed');
    return data;
}
export function PortableIdentityPanel({ gatewayAudience }: {
    gatewayAudience?: string;
}) {
    const [name, setName] = useState('');
    const [identity, setIdentity] = useState<PortableIdentity>();
    const [verified, setVerified] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [paymentAccount, setPaymentAccount] = useState('');
    const [paymentChain, setPaymentChain] = useState(5042002);
    const [association, setAssociation] = useState('');
    const switchChain = useSwitchChain();
    const [agentLabel, setAgentLabel] = useState('');
    const [agentKey, setAgentKey] = useState('');
    const [allowProposals, setAllowProposals] = useState(false);
    const [enrollment, setEnrollment] = useState('');
    const write = useWriteContract();
    const client = usePublicClient({ chainId: 11155111 });
    const { address, chainId } = useConnection();
    const connectors = useConnectors();
    const connect = useConnect();
    const sign = useSignMessage();
    async function run(fn: () => Promise<void>) { setBusy(true); setError(''); try {
        await fn();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Identity request failed');
    }
    finally {
        setBusy(false);
    } }
    return <section style={{ maxWidth: 760, margin: '40px auto', padding: 24 }}>
    <p>Portable identity</p><h1>Start with your ENS name.</h1>
    <p>Keep one identity across clients. Add payment accounts and agent integrations when you need them.</p>
    <form onSubmit={e => { e.preventDefault(); void run(async () => { setVerified(false); setIdentity(undefined); setIdentity(await api<PortableIdentity>(`discover?deployment=${portableIdentityDeployment}&name=${encodeURIComponent(name)}`)); }); }}>
      <label htmlFor="identity-name">ENSv2 name</label><input id="identity-name" value={name} onChange={e => { setName(e.target.value); setIdentity(undefined); setVerified(false); }} placeholder="research-desk.wayleave.eth" required style={{ display: 'block', width: '100%', padding: 12, margin: '12px 0' }}/>
      <p>Network: ENSv2 ETHOnline deployment on Sepolia. Production ENS names are separate.</p>
      <button disabled={busy} type="submit">{busy ? 'Checking…' : 'Find identity'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {identity && <section aria-label="Discovered identity" style={{ marginTop: 28 }}>
      <h2>{identity.name}</h2><p>Public registry discovery · Sepolia</p>
      <dl><dt>Registry owner</dt><dd style={{ overflowWrap: 'anywhere' }}>{identity.controller}</dd><dt>Expires</dt><dd>{new Date(identity.expiresAt * 1000).toLocaleString()}</dd></dl>
      {!verified ? <><p>Verify control to save this workspace. Looking up a name does not sign you in or provide access to payment history.</p>
        {!address ? connectors.map(connector => <button key={connector.uid} disabled={busy} onClick={() => void run(async () => { await connect.mutateAsync({ connector }); })}>Connect {connector.name}</button>) : <button disabled={busy} onClick={() => void run(async () => {
                        const challenge = await api<{
                            proof: IdentityProof;
                            message: string;
                        }>('challenge', { deployment: portableIdentityDeployment, kind: 'owner', name: identity.name });
                        if (challenge.proof.audience !== (gatewayAudience ?? window.location.origin) || challenge.message !== identityProofMessage(challenge.proof))
                            throw new Error('Gateway challenge does not match this site');
                        const signature = await sign.mutateAsync({ message: challenge.message });
                        await api('verify', { nonce: challenge.proof.nonce, signature });
                        setVerified(true);
                    })}>Verify control</button>}
        <p>Use the registry owner’s wallet. Smart-account owners need a compatible contract-signature wallet.</p></> : <><h3>Identity verified</h3><p>Your workspace is ready. No payment account or integration has been attached.</p><p>Agent enrollment can be added later. It grants read or payment-proposal access; every payment still needs its own approval.</p><Link href="/accounts">Explore payment accounts</Link><p><Link href="/connect">View agent integrations</Link></p><button onClick={() => void run(async () => { await api('logout', {}); setVerified(false); })}>Sign out of identity</button></>}
      {verified && <section aria-label="Attach payment account">
        <h3>Add a payment account when you’re ready</h3>
        <p>Both this identity and the payment account must authorize the association. This does not authorize spending.</p>
        <label>Account network<select value={paymentChain} onChange={e => setPaymentChain(Number(e.target.value))}><option value={5042002}>Arc Testnet</option><option value={11155111}>Sepolia</option></select></label>
        <label>Payment account address<input value={paymentAccount} onChange={e => setPaymentAccount(e.target.value)} placeholder="0x…"/></label>
        <button disabled={busy} onClick={() => void run(async () => {
                    if (!isAddress(paymentAccount))
                        throw new Error('Enter the payment smart-account address');
                    const challenge = await api<{
                        binding: {
                            nonce: string;
                            audience: string;
                            identity: string;
                            account: string;
                            chainId: number;
                            controller: string;
                        };
                        message: string;
                    }>('accounts/challenge', { chainId: paymentChain, account: paymentAccount });
                    if (challenge.binding.audience !== (gatewayAudience ?? window.location.origin) || challenge.binding.identity !== identity.name || challenge.binding.account.toLowerCase() !== paymentAccount.toLowerCase() || challenge.binding.chainId !== paymentChain)
                        throw new Error('Unexpected account association challenge');
                    if (address?.toLowerCase() !== challenge.binding.controller.toLowerCase())
                        throw new Error(`Connect the payment account’s controller (${challenge.binding.controller}) to approve this association.`);
                    if (chainId !== paymentChain)
                        await switchChain.mutateAsync({ chainId: paymentChain });
                    const signature = await sign.mutateAsync({ message: challenge.message });
                    await api('accounts/attach', { nonce: challenge.binding.nonce, signature });
                    setAssociation(`Associated ${paymentAccount} on ${paymentChain === 5042002 ? 'Arc Testnet' : 'Sepolia'}.`);
                })}>Review account association</button>
        {association && <p role="status">{association}</p>}
      </section>}
      {verified && identity.subregistry !== zeroAddress && <section aria-label="Agent enrollment">
        <h3>Enroll or rotate an agent</h3><p>Publish a client’s public authentication address under this identity. Its private key stays in the client’s credential store.</p>
        <label>Agent label<input value={agentLabel} onChange={e => setAgentLabel(e.target.value)} placeholder="codex"/></label>
        <label>Public authentication address<input value={agentKey} onChange={e => setAgentKey(e.target.value)} placeholder="0x…"/></label>
        <label><input type="checkbox" checked={allowProposals} onChange={e => setAllowProposals(e.target.checked)}/>Allow payment proposals in addition to reading</label>
        <p>Enrollment lasts up to 30 days, within the identity’s expiry. Re-enrolling a label rotates its key and invalidates its old sessions.</p>
        <button disabled={busy} onClick={() => void run(async () => {
                    if (!client || chainId !== 11155111)
                        throw new Error('Connect the controlling wallet on Sepolia');
                    if (address?.toLowerCase() !== identity.controller.toLowerCase())
                        throw new Error('This wallet cannot directly manage the identity. Execute enrollment through its controlling smart account.');
                    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(agentLabel) || !isAddress(agentKey))
                        throw new Error('Enter a lowercase agent label and public address');
                    const version = await client.readContract({ address: identity.subregistry, abi: wayleaveAgentRegistryAbi, functionName: 'schemaVersion' });
                    if (version !== 1n)
                        throw new Error('The attached registry does not support Wayleave agent enrollment');
                    const transactionHash = await write.mutateAsync({ address: identity.subregistry, abi: wayleaveAgentRegistryAbi, functionName: 'enroll', args: [agentLabel, agentKey, BigInt(Math.min(identity.expiresAt, Math.floor(Date.now() / 1000) + 30 * 86400)), allowProposals ? 3 : 1], chainId: 11155111 });
                    const receipt = await client.waitForTransactionReceipt({ hash: transactionHash });
                    if (receipt.status !== 'success')
                        throw new Error('Enrollment transaction failed');
                    setEnrollment(`Enrolled ${agentLabel}.${identity.name}. Transaction: ${transactionHash}`);
                })}>Review enrollment transaction</button>
        <button disabled={busy} onClick={() => void run(async () => {
                    if (!client || chainId !== 11155111 || address?.toLowerCase() !== identity.controller.toLowerCase())
                        throw new Error('Use the identity controller on Sepolia');
                    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(agentLabel))
                        throw new Error('Enter the enrolled agent label');
                    const hash = await write.mutateAsync({ address: identity.subregistry, abi: wayleaveAgentRegistryAbi, functionName: 'remove', args: [agentLabel], chainId: 11155111 });
                    const receipt = await client.waitForTransactionReceipt({ hash });
                    if (receipt.status !== 'success')
                        throw new Error('Removal transaction failed');
                    setEnrollment(`Removed ${agentLabel}.${identity.name}. Transaction: ${hash}`);
                })}>Review removal transaction</button>
        {enrollment && <p role="status">{enrollment}</p>}
      </section>}
      <p>{identity.canSetSubregistry ? 'The owner can configure a child registry for agent enrollment.' : 'This owner lacks the child-registry permission; existing records will be preserved.'}</p>
    </section>}
  </section>;
}
