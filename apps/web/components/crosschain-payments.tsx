'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Purchase } from 'wayleave-merchant';

import { TestPurchasePrompt } from './test-purchase-prompt';
import { PurchaseTracker } from './purchase-tracker';
import { gatewayResponse } from '../lib/gateway-response';

import { useEffect, useRef, useState } from 'react';
import {
  Wallet,
  ArrowRight,
  ReceiptText,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import './agent-flows.css';
import './payments.css';
import { MerchantAcceptance } from './payment-experience';
import { useConnection, usePublicClient, useWalletClient } from 'wagmi';
import { arcTestnet, sepolia } from 'viem/chains';
import {
  erc20Abi,
  formatUnits,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import {
  arcCctpRoute,
  cctpMintCall,
  cctpOwnerPayment,
  entryPointAbi,
  ownerAuthorization,
  parseCctpIntent,
  type CctpIntent,
} from '@mandate/sdk';
import type { Prepared } from '@mandate/gateway/chain';

type Payment = {
  id: string;
  intent: CctpIntent;
  status: string;
  prepared?: Prepared;
  signature?: Hex;
  sourceTransactionHash?: Hex;
  destinationTransactionHash?: Hex;
  source?: { transactionHash: Hex };
  destination?: { transactionHash: Hex; merchantAmount: string };
  circle?: { message: Hex; attestation: Hex };
};
type Recovery = Record<string, { source?: Hex; destination?: Hex }>;
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/gateway/crosschain${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return gatewayResponse<T>(response);
}
const asOperation = (p: Prepared, signature: Hex) => ({
  ...p.op,
  nonce: BigInt(p.op.nonce),
  preVerificationGas: BigInt(p.op.preVerificationGas),
  signature,
});
const currentRoute = (payment: Payment) => {
  try {
    parseCctpIntent(payment.intent);
    return true;
  } catch {
    return false;
  }
};
const usdc = (value: string) => formatUnits(BigInt(value), 6);

export function Payments() {
  const query = useSearchParams();
  const valid = (value: string | null) =>
    value && /^[a-f0-9-]{36}$/.test(value) ? value : '';
  const requestId = valid(query.get('request')),
    purchaseId = valid(query.get('purchase'));
  return (
    <PaymentWorkspace
      key={`${requestId}:${purchaseId}`}
      requestId={requestId}
      initialPurchaseId={purchaseId}
    />
  );
}

function PaymentWorkspace({
  requestId,
  initialPurchaseId,
}: {
  requestId: string;
  initialPurchaseId: string;
}) {
  const { address, chainId } = useConnection();
  const { data: wallet } = useWalletClient();
  const sourceClient = usePublicClient({ chainId: arcTestnet.id });
  const destinationClient = usePublicClient({ chainId: sepolia.id });
  const [view, setView] = useState<'payments' | 'merchants'>('payments');
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [composing, setComposing] = useState(false);
  const [focusedRequest, setFocusedRequest] = useState(requestId);
  const [purchaseId, setPurchaseId] = useState(initialPurchaseId);
  const [loaded, setLoaded] = useState(false);
  const [configured, setConfigured] = useState<boolean>();
  const [entryPoint, setEntryPoint] = useState<Address>();
  const [setupReceipt, setSetupReceipt] = useState<Record<string, string>>({});
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
  async function loadConfiguration() {
    const value = await api<{ configured: boolean; entryPoint?: Address }>(
      '/config',
    );
    setConfigured(value.configured);
    setEntryPoint(value.entryPoint);
    setError('');
  }
  useEffect(() => {
    void loadConfiguration().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setPayments([]);
    setRecovery({});
    setLoaded(false);
    setComposing(false);
    setSetupReceipt({});
    if (!address) return;
    try {
      setRecovery(
        JSON.parse(
          localStorage.getItem(`wayleave:cctp:${address.toLowerCase()}`) ??
            '{}',
        ),
      );
    } catch {
      /* No stored receipt. */
    }
  }, [address]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment request failed.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    const owner = address;
    const { operations: records } = await api<{ operations: Payment[] }>('');
    if (focusedRequest && !records.some((p) => p.id === focusedRequest))
      records.unshift(await api<Payment>(`/${focusedRequest}`));
    if (purchaseId) {
      const purchase = await gatewayResponse<Purchase>(
        await fetch(`/gateway/merchant/purchases/${purchaseId}`, {
          credentials: 'same-origin',
        }),
      );
      if (purchase.operationId !== focusedRequest)
        throw new Error(
          'This purchase does not match the linked payment. Open the approval URL returned by your agent.',
        );
    }
    if (currentOwner.current !== owner) return;
    setLoaded(true);
    setPayments(
      records.filter(
        (p) => p.intent.fundingOwner.toLowerCase() === owner?.toLowerCase(),
      ),
    );
  }
  function remember(
    id: string,
    phase: 'source' | 'destination',
    hash: Hex,
    owner: Address,
  ) {
    // Only public transaction hashes are persisted, never replayable signatures.
    const key = `wayleave:cctp:${owner.toLowerCase()}`;
    let prior: Recovery = {};
    try {
      prior = JSON.parse(localStorage.getItem(key) ?? '{}');
    } catch {
      /* Reconstruct from chain if needed. */
    }
    const next = { ...prior, [id]: { ...prior[id], [phase]: hash } };
    localStorage.setItem(key, JSON.stringify(next));
    if (currentOwner.current === owner) setRecovery(next);
  }
  async function connected(payment: Payment, chainId: number) {
    if (
      !address ||
      !wallet ||
      currentOwner.current !== address ||
      wallet.account.address.toLowerCase() !==
        payment.intent.fundingOwner.toLowerCase()
    )
      throw new Error('Connect the owner who approved this payment.');
    if ((await wallet.getChainId()) !== chainId)
      throw new Error(
        `Switch your wallet to ${chainId === arcTestnet.id ? 'Arc Testnet' : 'Ethereum Sepolia'}, then retry.`,
      );
    return wallet;
  }
  async function prepare(payment: Payment) {
    const { prepared: p } = await api<{ prepared: Prepared }>(
      `/${payment.id}/prepare`,
      {},
    );
    if (
      p.op.callData !== cctpOwnerPayment(payment.intent) ||
      p.op.sender.toLowerCase() !== payment.intent.account.toLowerCase()
    )
      throw new Error('Prepared payment differs from the reviewed request.');
    await refresh();
  }
  async function approve(payment: Payment) {
    const signer = await connected(payment, arcTestnet.id);
    const p = payment.prepared;
    if (
      !p ||
      !sourceClient ||
      p.op.callData !== cctpOwnerPayment(payment.intent) ||
      p.op.sender.toLowerCase() !== payment.intent.account.toLowerCase()
    )
      throw new Error('Prepare and review this payment first.');
    const hash = await sourceClient.readContract({
      address: p.entryPoint,
      abi: entryPointAbi,
      functionName: 'getUserOpHash',
      args: [asOperation(p, '0x')],
    });
    if (hash !== p.actionHash)
      throw new Error('Payment authorization hash does not match.');
    const signature = await signer.signTypedData({
      ...ownerAuthorization(
        arcTestnet.id,
        p.validator,
        payment.intent.account,
        BigInt(p.tokenId),
        BigInt(p.epoch),
        p.actionHash,
      ),
    });
    if (currentOwner.current !== address)
      throw new Error('Wallet changed while signing.');
    await api(`/${payment.id}/approve`, { signature });
    await refresh();
  }
  async function submitSource(payment: Payment) {
    const signer = await connected(payment, arcTestnet.id);
    if (!payment.prepared || !payment.signature || !sourceClient)
      throw new Error('Approve this payment first.');
    let hash =
      payment.source?.transactionHash ??
      payment.sourceTransactionHash ??
      recovery[payment.id]?.source;
    if (!hash) {
      if (payment.prepared.op.callData !== cctpOwnerPayment(payment.intent))
        throw new Error('Source payment differs from the reviewed request.');
      hash = await signer.writeContract({
        chain: arcTestnet,
        address: payment.prepared.entryPoint,
        abi: entryPointAbi,
        functionName: 'handleOps',
        args: [
          [asOperation(payment.prepared, payment.signature)],
          signer.account.address,
        ],
      });
      remember(payment.id, 'source', hash, signer.account.address);
    }
    // Record even an unconfirmed transaction on the server before waiting locally.
    // A 409 can mean pending RPC inclusion; the durable hash is still retained.
    await api(`/${payment.id}/source`, { transactionHash: hash }).catch(
      () => undefined,
    );
    await sourceClient.waitForTransactionReceipt({ hash });
    await api(`/${payment.id}/source`, { transactionHash: hash });
    await refresh();
  }
  async function submitDestination(payment: Payment) {
    const signer = await connected(payment, sepolia.id);
    if (!payment.circle || !destinationClient)
      throw new Error('Retrieve the Circle attestation first.');
    const call = cctpMintCall(
      payment.circle.message,
      payment.circle.attestation,
      payment.intent,
    );
    let hash =
      payment.destination?.transactionHash ??
      payment.destinationTransactionHash ??
      recovery[payment.id]?.destination;
    if (hash && !payment.destination) {
      // Only a confirmed revert permits another destination transaction; always reuse the same attested message.
      const previous = await destinationClient
        .getTransactionReceipt({ hash })
        .catch(() => null);
      if (previous?.status === 'reverted') hash = undefined;
    }
    if (!hash) {
      hash = await signer.sendTransaction({
        chain: sepolia,
        to: call.to,
        data: call.data,
        value: 0n,
      });
      remember(payment.id, 'destination', hash, signer.account.address);
    }
    await api(`/${payment.id}/destination`, { transactionHash: hash }).catch(
      () => undefined,
    );
    await destinationClient.waitForTransactionReceipt({ hash });
    await api(`/${payment.id}/destination`, { transactionHash: hash });
    await refresh();
  }
  return (
    <section className="wl-agent-settings payments-workspace">
      <div className="payments-heading">
        <div>
          <span className="flow-eyebrow">YOUR AGENTS, YOUR APPROVAL</span>
          <h1>Payments</h1>
          <p>A familiar name at checkout. A payment you control.</p>
        </div>
        <Link className="secondary" href="/connect">
          Grant agent access <Plus size={16} />
        </Link>
      </div>
      <div className="payments-navigation" aria-label="Payment views">
        <button
          aria-pressed={view === 'payments'}
          onClick={() => setView('payments')}
        >
          Your payments
        </button>
        <button
          aria-pressed={view === 'merchants'}
          onClick={() => setView('merchants')}
        >
          Accept payments
        </button>
        <span className="payments-network">
          <span /> Arc Testnet
        </span>
      </div>
      {view === 'merchants' ? (
        <MerchantAcceptance />
      ) : (
        <div className="flow-layout payments-layout">
          <div className="flow-main">
            <TestPurchasePrompt />
            {focusedRequest && (
              <div className="flow-message">
                <strong>Review the purchase your agent requested.</strong>
                <p>
                  Connect and sign in, then load your requests. The matching
                  payment opens below.
                </p>
                <button
                  onClick={() => {
                    setFocusedRequest('');
                    setPurchaseId('');
                  }}
                >
                  Show all payments
                </button>
              </div>
            )}
            {loaded &&
              focusedRequest &&
              !payments.some((payment) => payment.id === focusedRequest) && (
                <p role="alert">
                  This payment was not found for your connected wallet.
                </p>
              )}
            {error && (
              <p className="flow-message" role="alert">
                {error}
              </p>
            )}
            {configured === undefined && error && (
              <button disabled={busy} onClick={() => run(loadConfiguration)}>
                Try again
              </button>
            )}
            {configured === false && (
              <div className="flow-surface flow-empty" role="status">
                <ReceiptText size={28} />
                <h2>Payments aren’t ready here yet</h2>
                <p>
                  Arc payments are not configured. You can still manage your
                  agent wallets on Sepolia.
                </p>
              </div>
            )}
            {configured === undefined && !error && (
              <p role="status">Checking payment availability…</p>
            )}
            {configured && (
              <>
                <div className="flow-section-heading">
                  <h2>Requests & activity</h2>
                  <div className="flow-inline-actions">
                    {address && (
                      <button disabled={busy} onClick={() => run(refresh)}>
                        {busy
                          ? 'Loading…'
                          : loaded
                            ? 'Refresh'
                            : 'Load requests'}
                      </button>
                    )}
                    {address && (
                      <button
                        disabled={busy}
                        aria-expanded={composing}
                        onClick={() => setComposing(!composing)}
                      >
                        <Plus size={15} />
                        {composing ? 'Close request' : 'Create request'}
                      </button>
                    )}
                  </div>
                </div>
                {!address && (
                  <div className="flow-surface flow-empty">
                    <span className="flow-symbol">
                      <Wallet size={24} />
                    </span>
                    <h2>Your next payment starts here</h2>
                    <p>
                      Connect your wallet to review agent requests and follow
                      payments to their recipients. You approve before funds
                      move.
                    </p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const { openWalletPicker } =
                            await import('../lib/wallet-config');
                          await openWalletPicker();
                        })
                      }
                    >
                      Connect wallet <ArrowRight size={16} />
                    </button>
                  </div>
                )}
                {address && !composing && payments.length === 0 && (
                  <div className="flow-surface flow-empty">
                    <ReceiptText size={28} />
                    <h2>
                      {loaded
                        ? 'No payment requests yet'
                        : 'Your requests, in one place'}
                    </h2>
                    <p>
                      {loaded
                        ? 'Requests from your agent will appear here for review. You can also create one yourself.'
                        : 'Load requests for your connected wallet to review payments or pick up a transfer in progress.'}
                    </p>
                  </div>
                )}
                {address && composing && (
                  <div className="flow-surface">
                    <h2>Create a manual request</h2>
                    <p>
                      This saves a request for review. You’ll approve any
                      movement of funds separately.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          if (!address)
                            throw new Error(
                              'Connect and verify the funding owner first.',
                            );
                          if (
                            !/^\d+(\.\d{1,6})?$/.test(amount) ||
                            !/^\d+(\.\d{1,6})?$/.test(maxFee)
                          )
                            throw new Error(
                              'USDC amounts accept at most six decimal places.',
                            );
                          const key = requestKey || crypto.randomUUID();
                          setRequestKey(key);
                          const intent = parseCctpIntent({
                            version: 1,
                            kind: 'cctp_payment',
                            sourceChainId: arcCctpRoute.sourceChainId,
                            destinationChainId: arcCctpRoute.destinationChainId,
                            sourceDomain: arcCctpRoute.sourceDomain,
                            destinationDomain: arcCctpRoute.destinationDomain,
                            sourceToken: arcCctpRoute.sourceToken,
                            destinationToken: arcCctpRoute.destinationToken,
                            account,
                            fundingOwner: address,
                            recipient,
                            amount: parseUnits(amount, 6).toString(),
                            maxFee: parseUnits(maxFee, 6).toString(),
                            amountSemantics: 'source_debit',
                            minFinalityThreshold: 2000,
                            businessReference: reference,
                            idempotencyKey: key,
                          });
                          await api('', { intent });
                          setRequestKey('');
                          setComposing(false);
                          await refresh();
                        });
                      }}
                    >
                      <div className="flow-fields">
                        <label className="flow-wide">
                          Agent wallet on Arc
                          <input
                            required
                            value={account}
                            onChange={(e) => {
                              setAccount(e.target.value);
                              setRequestKey('');
                            }}
                            placeholder="0x…"
                          />
                        </label>
                        <label className="flow-wide">
                          Recipient on Sepolia
                          <input
                            required
                            value={recipient}
                            onChange={(e) => {
                              setRecipient(e.target.value);
                              setRequestKey('');
                            }}
                            placeholder="0x…"
                          />
                        </label>
                        <label>
                          Amount from your wallet (USDC)
                          <input
                            required
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => {
                              setAmount(e.target.value);
                              setRequestKey('');
                            }}
                          />
                        </label>
                        <label>
                          Maximum transfer fee (USDC)
                          <input
                            required
                            inputMode="decimal"
                            value={maxFee}
                            onChange={(e) => {
                              setMaxFee(e.target.value);
                              setRequestKey('');
                            }}
                          />
                        </label>
                        <label className="flow-wide">
                          Payment reference
                          <input
                            required
                            maxLength={128}
                            value={reference}
                            onChange={(e) => {
                              setReference(e.target.value);
                              setRequestKey('');
                            }}
                          />
                        </label>
                      </div>
                      <p className="flow-note">
                        The recipient gets this amount minus the transfer fee.
                        You pay Arc gas in USDC and Sepolia gas in ETH.
                      </p>
                      <button
                        className="primary"
                        type="submit"
                        disabled={busy || !address}
                      >
                        Save request for review <ArrowRight size={16} />
                      </button>
                    </form>
                  </div>
                )}
                {loaded && payments.length > 0 && (
                  <div
                    className="payments-filters"
                    aria-label="Filter payments"
                  >
                    {(['all', 'pending', 'paid'] as const).map((value) => (
                      <button
                        key={value}
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value)}
                      >
                        {value === 'all'
                          ? 'All payments'
                          : value === 'pending'
                            ? 'In progress'
                            : 'Paid'}
                      </button>
                    ))}
                  </div>
                )}
                {loaded &&
                  payments.length > 0 &&
                  !payments.some(
                    (p) =>
                      filter === 'all' ||
                      (filter === 'paid' ? !!p.destination : !p.destination),
                  ) && (
                    <p className="flow-message">No payments in this view.</p>
                  )}
                {payments
                  .filter((p) => !focusedRequest || p.id === focusedRequest)
                  .filter(
                    (p) =>
                      filter === 'all' ||
                      (filter === 'paid' ? !!p.destination : !p.destination),
                  )
                  .map((payment) =>
                    !currentRoute(payment) ? (
                      <article
                        className="flow-surface payment-record"
                        key={payment.id}
                      >
                        <h2>{payment.intent.businessReference}</h2>
                        <p>
                          This saved request targets a route no longer supported
                          by this release. Its approved terms are unchanged. A
                          request with an existing source transaction needs
                          reconciliation on its original route.
                        </p>
                      </article>
                    ) : (
                      <article
                        className="flow-surface payment-record"
                        key={payment.id}
                      >
                        <div className="payment-record-heading">
                          <div>
                            <span className="flow-eyebrow">
                              {payment.destination
                                ? 'Payment received'
                                : payment.source
                                  ? 'On its way'
                                  : payment.sourceTransactionHash ||
                                      recovery[payment.id]?.source
                                    ? 'Checking Arc transaction'
                                    : payment.signature
                                      ? 'Approved · Ready to send'
                                      : 'Needs your approval'}
                            </span>
                            <h2>{payment.intent.businessReference}</h2>
                          </div>
                          <strong className="payment-amount">
                            {usdc(payment.intent.amount)} <small>USDC</small>
                          </strong>
                        </div>
                        <details
                          className="payment-review"
                          open={focusedRequest === payment.id || undefined}
                        >
                          <summary>
                            {payment.destination
                              ? 'View receipt'
                              : 'Review payment'}{' '}
                            <span>Arc → Ethereum Sepolia</span>
                          </summary>
                          <dl>
                            <dt>From your wallet</dt>
                            <dd>{payment.intent.fundingOwner}</dd>
                            <dt>Maximum transfer fee</dt>
                            <dd>{usdc(payment.intent.maxFee)} USDC</dd>
                            <dt>Minimum received</dt>
                            <dd>
                              {usdc(
                                (
                                  BigInt(payment.intent.amount) -
                                  BigInt(payment.intent.maxFee)
                                ).toString(),
                              )}{' '}
                              USDC
                            </dd>
                            <dt>Recipient · Sepolia</dt>
                            <dd>{payment.intent.recipient}</dd>
                            <dt>Via agent wallet · Arc</dt>
                            <dd>{payment.intent.account}</dd>
                          </dl>
                          {(payment.source?.transactionHash ??
                            payment.sourceTransactionHash ??
                            recovery[payment.id]?.source) && (
                            <p>
                              <a
                                href={`https://testnet.arcscan.app/tx/${payment.source?.transactionHash ?? payment.sourceTransactionHash ?? recovery[payment.id]?.source}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View Arc transaction ↗
                              </a>
                            </p>
                          )}
                          {(payment.destination?.transactionHash ??
                            payment.destinationTransactionHash ??
                            recovery[payment.id]?.destination) && (
                            <p>
                              <a
                                href={`https://sepolia.etherscan.io/tx/${payment.destination?.transactionHash ?? payment.destinationTransactionHash ?? recovery[payment.id]?.destination}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View Sepolia transaction ↗
                              </a>
                            </p>
                          )}
                          {payment.destination && (
                            <p>
                              Recipient received{' '}
                              {usdc(payment.destination.merchantAmount)} USDC.
                              Service delivery is separate.
                            </p>
                          )}
                          {!payment.destination && payment.source && (
                            <p className="flow-message" role="status">
                              {payment.circle
                                ? 'Ready to complete on Sepolia. Your wallet will need Sepolia ETH for this final transaction.'
                                : 'Your Arc payment is confirmed. Check transfer progress to see when it can be completed on Sepolia.'}
                            </p>
                          )}
                          {payment.prepared && (
                            <details className="flow-disclosure">
                              <summary>
                                Network costs and execution details
                              </summary>
                              <p>
                                Maximum account gas budget:{' '}
                                {formatUnits(
                                  (BigInt(payment.prepared.op.gasFees) &
                                    ((1n << 128n) - 1n)) *
                                    ((BigInt(
                                      payment.prepared.op.accountGasLimits,
                                    ) >>
                                      128n) +
                                      (BigInt(
                                        payment.prepared.op.accountGasLimits,
                                      ) &
                                        ((1n << 128n) - 1n)) +
                                      BigInt(
                                        payment.prepared.op.preVerificationGas,
                                      )),
                                  18,
                                )}{' '}
                                USDC. Actual source gas is determined onchain.
                              </p>
                              <p>
                                Recorded state:{' '}
                                {payment.status.replaceAll('_', ' ')}. Circle
                                CCTP settles this transfer in two transactions,
                                one on each network.
                              </p>
                            </details>
                          )}
                          {chainId !==
                            (payment.circle ? sepolia.id : arcTestnet.id) &&
                            !payment.destination && (
                              <button
                                disabled={busy || !wallet}
                                onClick={() =>
                                  run(async () => {
                                    await wallet!.switchChain({
                                      id: payment.circle
                                        ? sepolia.id
                                        : arcTestnet.id,
                                    });
                                  })
                                }
                              >
                                Switch wallet to{' '}
                                {payment.circle ? 'Sepolia' : 'Arc'}
                              </button>
                            )}
                          {!payment.signature && !payment.source && (
                            <details className="flow-disclosure">
                              <summary>
                                Prepare your wallet{' '}
                                <span>Allowance &amp; network costs</span>
                              </summary>
                              <p>
                                Before approval, allow this agent wallet to draw
                                exactly {usdc(payment.intent.amount)} USDC. An
                                account gas deposit may also be needed. Each
                                setup action opens a separate wallet
                                confirmation.
                              </p>
                              <div className="flow-inline-actions">
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    run(async () => {
                                      const signer = await connected(
                                        payment,
                                        arcTestnet.id,
                                      );
                                      if (!sourceClient)
                                        throw new Error('Arc RPC unavailable.');
                                      const hash = await signer.writeContract({
                                        chain: arcTestnet,
                                        address: arcCctpRoute.sourceToken,
                                        abi: erc20Abi,
                                        functionName: 'approve',
                                        args: [
                                          payment.intent.account,
                                          BigInt(payment.intent.amount),
                                        ],
                                      });
                                      const receipt =
                                        await sourceClient.waitForTransactionReceipt(
                                          {
                                            hash,
                                          },
                                        );
                                      if (receipt.status !== 'success')
                                        throw new Error(
                                          'Token allowance reverted.',
                                        );
                                      setSetupReceipt((prior) => ({
                                        ...prior,
                                        [payment.id]:
                                          'Payment allowance confirmed. The payment has not been sent.',
                                      }));
                                    })
                                  }
                                >
                                  Allow this payment amount
                                </button>
                              </div>
                              <label>
                                Gas deposit (USDC)
                                <input
                                  inputMode="decimal"
                                  value={gasDeposit}
                                  onChange={(event) =>
                                    setGasDeposit(event.target.value)
                                  }
                                  placeholder="Only if the account needs gas"
                                />
                              </label>
                              <button
                                disabled={busy || !entryPoint || !gasDeposit}
                                onClick={() =>
                                  run(async () => {
                                    const signer = await connected(
                                      payment,
                                      arcTestnet.id,
                                    );
                                    if (
                                      !sourceClient ||
                                      !entryPoint ||
                                      !/^\d+(\.\d{1,18})?$/.test(gasDeposit) ||
                                      parseUnits(gasDeposit, 18) <= 0n
                                    )
                                      throw new Error(
                                        'Enter a positive USDC gas deposit.',
                                      );
                                    const hash = await signer.writeContract({
                                      chain: arcTestnet,
                                      address: entryPoint,
                                      abi: entryPointAbi,
                                      functionName: 'depositTo',
                                      args: [payment.intent.account],
                                      value: parseUnits(gasDeposit, 18),
                                    });
                                    const receipt =
                                      await sourceClient.waitForTransactionReceipt(
                                        {
                                          hash,
                                        },
                                      );
                                    if (receipt.status !== 'success')
                                      throw new Error('Gas deposit reverted.');
                                    setSetupReceipt((prior) => ({
                                      ...prior,
                                      [payment.id]:
                                        'Account gas deposit confirmed. The payment has not been sent.',
                                    }));
                                  })
                                }
                              >
                                Add account gas deposit
                              </button>
                            </details>
                          )}
                          {setupReceipt[payment.id] && (
                            <p role="status">{setupReceipt[payment.id]}</p>
                          )}
                          <div className="flow-inline-actions">
                            {!payment.signature &&
                              !payment.source &&
                              (payment.prepared ? (
                                <button
                                  className="primary"
                                  disabled={busy}
                                  onClick={() => run(() => approve(payment))}
                                >
                                  Approve {usdc(payment.intent.amount)} USDC
                                </button>
                              ) : (
                                <button
                                  className="primary"
                                  disabled={busy}
                                  onClick={() => run(() => prepare(payment))}
                                >
                                  Check payment readiness
                                </button>
                              ))}
                            {payment.signature && !payment.source && (
                              <button
                                disabled={busy}
                                onClick={() => run(() => submitSource(payment))}
                              >
                                {payment.sourceTransactionHash ||
                                recovery[payment.id]?.source
                                  ? 'Check source receipt'
                                  : 'Send approved payment'}
                              </button>
                            )}
                            {payment.source &&
                              !payment.circle &&
                              !payment.destination && (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    run(async () => {
                                      await api(
                                        `/${payment.id}/attestation`,
                                        {},
                                      );
                                      await refresh();
                                    })
                                  }
                                >
                                  Check transfer progress
                                </button>
                              )}
                            {payment.circle && !payment.destination && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  run(() => submitDestination(payment))
                                }
                              >
                                {payment.destinationTransactionHash ||
                                recovery[payment.id]?.destination
                                  ? 'Check Sepolia receipt'
                                  : 'Complete payment on Sepolia'}
                              </button>
                            )}
                          </div>
                        </details>
                      </article>
                    ),
                  )}
              </>
            )}
          </div>
          <aside className="payments-context">
            <PurchaseTracker purchaseId={purchaseId || undefined} />
            <Link className="payments-identity-link" href="/identity">
              Set up your agent’s ENS identity <ArrowUpRight size={14} />
            </Link>
            <details className="flow-disclosure">
              <summary>About this test route</summary>
              <p>
                Circle CCTP transfers native test USDC from Arc to Ethereum
                Sepolia. This release requires a wallet transaction on each
                network. Destination submission is manual.
              </p>
              <p>
                The source amount includes the transfer fee. Gas is additional.
                Payment receipt and service delivery are separate.
              </p>
              <a
                href="https://testnet.arcscan.app/address/0xf4462268feEf5AB89e627F3C947Bd40C087C5F4d"
                target="_blank"
                rel="noreferrer"
              >
                View deployed Arc agent wallet ↗
              </a>
              <p>
                Deployment recorded September 11. A completed cross-chain
                transfer is not yet recorded in deployment evidence.
              </p>
            </details>
          </aside>
        </div>
      )}
    </section>
  );
}
