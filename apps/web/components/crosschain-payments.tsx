'use client';

import { useEffect, useRef, useState } from 'react';
import { useConnection, usePublicClient, useWalletClient } from 'wagmi';
import { arcTestnet, sepolia } from 'viem/chains';
import { erc20Abi, formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { arcCctpRoute, cctpMintCall, cctpOwnerPayment, entryPointAbi, ownerAuthorization, parseCctpIntent, type CctpIntent } from '@mandate/sdk';
import type { Prepared } from '@mandate/gateway/chain';

type Payment = {
  id: string; intent: CctpIntent; status: string; prepared?: Prepared; signature?: Hex;
  sourceTransactionHash?: Hex; destinationTransactionHash?: Hex;
  source?: { transactionHash: Hex }; destination?: { transactionHash: Hex; merchantAmount: string };
  circle?: { message: Hex; attestation: Hex };
};
type Recovery = Record<string, { source?: Hex; destination?: Hex }>;
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/gateway/crosschain${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'Cross-chain payment could not be completed.');
  return value as T;
}
const asOperation = (p: Prepared, signature: Hex) => ({ ...p.op, nonce: BigInt(p.op.nonce), preVerificationGas: BigInt(p.op.preVerificationGas), signature });
const currentRoute = (payment: Payment) => { try { parseCctpIntent(payment.intent); return true; } catch { return false; } };
const usdc = (value: string) => formatUnits(BigInt(value), 6);

export function CrosschainPayments() {
  const { address } = useConnection();
  const { data: wallet } = useWalletClient();
  const sourceClient = usePublicClient({ chainId: arcTestnet.id });
  const destinationClient = usePublicClient({ chainId: sepolia.id });
  const [configured, setConfigured] = useState<boolean>();
  const [entryPoint, setEntryPoint] = useState<Address>();
  const [gasDeposit, setGasDeposit] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [maxFee, setMaxFee] = useState('0');
  const [reference, setReference] = useState('');
  const [recovery, setRecovery] = useState<Recovery>({});
  const [requestKey, setRequestKey] = useState('');
  const lock = useRef(false);
  const currentOwner = useRef(address);
  currentOwner.current = address;
  useEffect(() => { void api<{ configured: boolean; entryPoint?: Address }>('/config').then(v => { setConfigured(v.configured); setEntryPoint(v.entryPoint); }).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    setPayments([]); setRecovery({});
    if (!address) return;
    try { setRecovery(JSON.parse(localStorage.getItem(`wayleave:cctp:${address.toLowerCase()}`) ?? '{}')); } catch { /* No stored receipt. */ }
  }, [address]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Payment request failed.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh() {
    const owner = address;
    const { operations: records } = await api<{ operations: Payment[] }>('');
    if (currentOwner.current !== owner) return;
    setPayments(records.filter(p => p.intent.fundingOwner.toLowerCase() === owner?.toLowerCase()));
  }
  function remember(id: string, phase: 'source' | 'destination', hash: Hex, owner: Address) {
    // Only public transaction hashes are persisted, never replayable signatures.
    const key = `wayleave:cctp:${owner.toLowerCase()}`;
    let prior: Recovery = {};
    try { prior = JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { /* Reconstruct from chain if needed. */ }
    const next = { ...prior, [id]: { ...prior[id], [phase]: hash } };
    localStorage.setItem(key, JSON.stringify(next));
    if (currentOwner.current === owner) setRecovery(next);
  }
  async function connected(payment: Payment, chainId: number) {
    if (!address || !wallet || currentOwner.current !== address || wallet.account.address.toLowerCase() !== payment.intent.fundingOwner.toLowerCase())
      throw new Error('Connect the owner who approved this payment.');
    if (await wallet.getChainId() !== chainId) throw new Error(`Switch your wallet to ${chainId === arcTestnet.id ? 'Arc Testnet' : 'Ethereum Sepolia'}, then retry.`);
    return wallet;
  }
  async function prepare(payment: Payment) {
    const { prepared: p } = await api<{ prepared: Prepared }>(`/${payment.id}/prepare`, {});
    if (p.op.callData !== cctpOwnerPayment(payment.intent) || p.op.sender.toLowerCase() !== payment.intent.account.toLowerCase()) throw new Error('Prepared payment differs from the reviewed request.');
    await refresh();
  }
  async function approve(payment: Payment) {
    const signer = await connected(payment, arcTestnet.id);
    const p = payment.prepared;
    if (!p || !sourceClient || p.op.callData !== cctpOwnerPayment(payment.intent) || p.op.sender.toLowerCase() !== payment.intent.account.toLowerCase()) throw new Error('Prepare and review this payment first.');
    const hash = await sourceClient.readContract({ address: p.entryPoint, abi: entryPointAbi, functionName: 'getUserOpHash', args: [asOperation(p, '0x')] });
    if (hash !== p.actionHash) throw new Error('Payment authorization hash does not match.');
    const signature = await signer.signTypedData({ ...ownerAuthorization(arcTestnet.id, p.validator, payment.intent.account, BigInt(p.tokenId), BigInt(p.epoch), p.actionHash) });
    if (currentOwner.current !== address) throw new Error('Wallet changed while signing.');
    await api(`/${payment.id}/approve`, { signature }); await refresh();
  }
  async function submitSource(payment: Payment) {
    const signer = await connected(payment, arcTestnet.id);
    if (!payment.prepared || !payment.signature || !sourceClient) throw new Error('Approve this payment first.');
    let hash = payment.source?.transactionHash ?? payment.sourceTransactionHash ?? recovery[payment.id]?.source;
    if (!hash) {
      if (payment.prepared.op.callData !== cctpOwnerPayment(payment.intent)) throw new Error('Source payment differs from the reviewed request.');
      hash = await signer.writeContract({ chain: arcTestnet, address: payment.prepared.entryPoint, abi: entryPointAbi, functionName: 'handleOps', args: [[asOperation(payment.prepared, payment.signature)], signer.account.address] });
      remember(payment.id, 'source', hash, signer.account.address);
    }
    // Record even an unconfirmed transaction on the server before waiting locally.
    // A 409 can mean pending RPC inclusion; the durable hash is still retained.
    await api(`/${payment.id}/source`, { transactionHash: hash }).catch(() => undefined);
    await sourceClient.waitForTransactionReceipt({ hash });
    await api(`/${payment.id}/source`, { transactionHash: hash }); await refresh();
  }
  async function submitDestination(payment: Payment) {
    const signer = await connected(payment, sepolia.id);
    if (!payment.circle || !destinationClient) throw new Error('Retrieve the Circle attestation first.');
    const call = cctpMintCall(payment.circle.message, payment.circle.attestation, payment.intent);
    let hash = payment.destination?.transactionHash ?? payment.destinationTransactionHash ?? recovery[payment.id]?.destination;
    if (hash && !payment.destination) {
      // Only a confirmed revert permits another destination transaction; always reuse the same attested message.
      const previous = await destinationClient.getTransactionReceipt({ hash }).catch(() => null);
      if (previous?.status === 'reverted') hash = undefined;
    }
    if (!hash) {
      hash = await signer.sendTransaction({ chain: sepolia, to: call.to, data: call.data, value: 0n });
      remember(payment.id, 'destination', hash, signer.account.address);
    }
    await api(`/${payment.id}/destination`, { transactionHash: hash }).catch(() => undefined);
    await destinationClient.waitForTransactionReceipt({ hash });
    await api(`/${payment.id}/destination`, { transactionHash: hash }); await refresh();
  }
  return <section className="crosschain-panel">
    <p>ARC TESTNET → ETHEREUM SEPOLIA</p><h1>Pay across chains</h1>
    <p>Approve a USDC payment from your Arc account. Follow its source transaction and destination receipt separately.</p>
    {configured === false && <p role="status">Arc account deployment is not configured yet. Cross-chain payment execution will become available after its deployment is verified.</p>}
    {configured === undefined && !error && <p role="status">Checking payment availability…</p>}
    {error && <p role="alert">{error}</p>}
    {configured && <>
      <div className="crosschain-actions">
        <button disabled={busy} onClick={() => run(async () => { const { openWalletPicker } = await import('../lib/wallet-config'); await openWalletPicker(); })}>{address ? 'Wallet connection' : 'Connect wallet'}</button>
        <button disabled={busy || !wallet} onClick={() => run(async () => { await wallet!.switchChain({ id: arcTestnet.id }); })}>Switch to Arc</button>
        <button disabled={busy || !wallet} onClick={() => run(async () => { await wallet!.switchChain({ id: sepolia.id }); })}>Switch to Ethereum Sepolia</button>
        <button disabled={busy || !address} onClick={() => run(refresh)}>Load payments</button>
      </div>
      <form onSubmit={e => { e.preventDefault(); void run(async () => {
        if (!address) throw new Error('Connect and verify the funding owner first.');
        if (!/^\d+(\.\d{1,6})?$/.test(amount) || !/^\d+(\.\d{1,6})?$/.test(maxFee)) throw new Error('USDC amounts accept at most six decimal places.');
        const key = requestKey || crypto.randomUUID(); setRequestKey(key);
        const intent = parseCctpIntent({ version: 1, kind: 'cctp_payment', sourceChainId: arcCctpRoute.sourceChainId, destinationChainId: arcCctpRoute.destinationChainId, sourceDomain: arcCctpRoute.sourceDomain, destinationDomain: arcCctpRoute.destinationDomain, sourceToken: arcCctpRoute.sourceToken, destinationToken: arcCctpRoute.destinationToken, account, fundingOwner: address, recipient, amount: parseUnits(amount, 6).toString(), maxFee: parseUnits(maxFee, 6).toString(), amountSemantics: 'source_debit', minFinalityThreshold: 2000, businessReference: reference, idempotencyKey: key });
        await api('', { intent }); setRequestKey(''); await refresh();
      }); }}>
        <div className="crosschain-fields">
          <label className="crosschain-wide">Arc NFAT account<input required value={account} onChange={e => {setAccount(e.target.value); setRequestKey('');}} placeholder="0x…" /></label>
          <label className="crosschain-wide">Merchant address on Ethereum Sepolia<input required value={recipient} onChange={e => {setRecipient(e.target.value); setRequestKey('');}} placeholder="0x…" /></label>
          <label>Source debit (USDC)<input required inputMode="decimal" value={amount} onChange={e => {setAmount(e.target.value); setRequestKey('');}} /></label>
          <label>Maximum Circle fee (USDC)<input required inputMode="decimal" value={maxFee} onChange={e => {setMaxFee(e.target.value); setRequestKey('');}} /></label>
          <label className="crosschain-wide">Payment reference<input required maxLength={128} value={reference} onChange={e => {setReference(e.target.value); setRequestKey('');}} /></label>
        </div>
        <p>The merchant receives the source debit minus the actual Circle fee. Arc source gas is paid in USDC; Ethereum Sepolia destination gas is paid in ETH. Your owner wallet needs USDC for the payment and transaction gas, an exact token allowance to this account, and a funded account gas deposit. Arc native USDC and its token balance are the same funds.</p>
        <button type="submit" disabled={busy || !address}>Create payment request</button>
      </form>
      <label>Optional gas deposit amount (USDC)<input inputMode="decimal" value={gasDeposit} onChange={event => setGasDeposit(event.target.value)} placeholder="Amount to escrow for account gas" /></label>
      {payments.map(payment => !currentRoute(payment) ? <article className="crosschain-record" key={payment.id}><h2>{payment.intent.businessReference}</h2><p>This saved request targets a route no longer supported by this release. Its approved terms are unchanged. A request with an existing source transaction needs reconciliation on its original route.</p></article> : <article className="crosschain-record" key={payment.id}>
        <h2>{payment.intent.businessReference}</h2>
        <dl><dt>State</dt><dd>{payment.status.replaceAll('_', ' ')}</dd><dt>Source debit</dt><dd>{usdc(payment.intent.amount)} USDC</dd><dt>Minimum received</dt><dd>{usdc((BigInt(payment.intent.amount) - BigInt(payment.intent.maxFee)).toString())} USDC</dd><dt>Merchant</dt><dd>{payment.intent.recipient}</dd><dt>Account</dt><dd>{payment.intent.account}</dd></dl>
        {(payment.source?.transactionHash ?? payment.sourceTransactionHash ?? recovery[payment.id]?.source) && <p><a href={`https://testnet.arcscan.app/tx/${payment.source?.transactionHash ?? payment.sourceTransactionHash ?? recovery[payment.id]?.source}`} target="_blank" rel="noreferrer">Source transaction</a></p>}
        {(payment.destination?.transactionHash ?? payment.destinationTransactionHash ?? recovery[payment.id]?.destination) && <p><a href={`https://sepolia.etherscan.io/tx/${payment.destination?.transactionHash ?? payment.destinationTransactionHash ?? recovery[payment.id]?.destination}`} target="_blank" rel="noreferrer">Destination transaction</a></p>}
        {payment.destination && <p>Merchant received {usdc(payment.destination.merchantAmount)} USDC. Service delivery is separate.</p>}
        {payment.prepared && <p>Maximum account gas budget: {formatUnits((BigInt(payment.prepared.op.gasFees) & ((1n << 128n) - 1n)) * ((BigInt(payment.prepared.op.accountGasLimits) >> 128n) + (BigInt(payment.prepared.op.accountGasLimits) & ((1n << 128n) - 1n)) + BigInt(payment.prepared.op.preVerificationGas)), 18)} USDC. Actual source gas is determined onchain.</p>}
        <div className="crosschain-actions">
          {!payment.signature && !payment.source && <>
            <button disabled={busy} onClick={() => run(async () => {
              const signer = await connected(payment, arcTestnet.id);
              if (!sourceClient) throw new Error('Arc RPC unavailable.');
              const hash = await signer.writeContract({ chain: arcTestnet, address: arcCctpRoute.sourceToken, abi: erc20Abi, functionName: 'approve', args: [payment.intent.account, BigInt(payment.intent.amount)] });
              const receipt = await sourceClient.waitForTransactionReceipt({ hash });
              if (receipt.status !== 'success') throw new Error('Token allowance reverted.');
            })}>Set exact payment allowance</button>
            <button disabled={busy || !entryPoint || !gasDeposit} onClick={() => run(async () => {
              const signer = await connected(payment, arcTestnet.id);
              if (!sourceClient || !entryPoint || !/^\d+(\.\d{1,18})?$/.test(gasDeposit) || parseUnits(gasDeposit,18) <= 0n) throw new Error('Enter a positive USDC gas deposit.');
              const hash = await signer.writeContract({ chain: arcTestnet, address: entryPoint, abi: entryPointAbi, functionName: 'depositTo', args: [payment.intent.account], value: parseUnits(gasDeposit,18) });
              const receipt = await sourceClient.waitForTransactionReceipt({ hash });
              if (receipt.status !== 'success') throw new Error('Gas deposit reverted.');
            })}>Add account gas deposit</button>
          </>}
          {!payment.signature && !payment.source && <><button disabled={busy} onClick={() => run(() => prepare(payment))}>Prepare payment</button><button disabled={busy || !payment.prepared} onClick={() => run(() => approve(payment))}>Approve exact payment</button></>}
          {payment.signature && !payment.source && <button disabled={busy} onClick={() => run(() => submitSource(payment))}>{payment.sourceTransactionHash || recovery[payment.id]?.source ? 'Check source receipt' : 'Submit on Arc'}</button>}
          {payment.source && !payment.destination && <button disabled={busy} onClick={() => run(async () => { await api(`/${payment.id}/attestation`, {}); await refresh(); })}>Check Circle attestation</button>}
          {payment.circle && !payment.destination && <button disabled={busy} onClick={() => run(() => submitDestination(payment))}>{payment.destinationTransactionHash || recovery[payment.id]?.destination ? 'Resume destination mint' : 'Mint on Ethereum Sepolia'}</button>}
        </div>
      </article>)}
    </>}
  </section>;
}
