'use client';
import { useEffect, useRef, useState } from 'react';
import { useConnection, usePublicClient, useWalletClient } from 'wagmi';
import { sepolia } from 'viem/chains';
import { type Address, type Hex } from 'viem';
import {
  sepoliaDeployment as d,
  mockUSDCAbi,
  entryPointAbi,
  kernelAccountFactoryAbi,
  nFTOwnerValidatorAbi,
} from '@mandate/sdk';
import type { PaymentIntent } from '@mandate/protocol';
import {
  paymentSetupSteps,
  reuseReviewedGasQuote,
  type FundingStep,
} from '../lib/payment-setup';

export function PaymentSetup({
  intent,
  onReady,
  onBusyChange,
}: {
  intent: PaymentIntent;
  onReady: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const { address, connector } = useConnection();
  const { data: wallet } = useWalletClient();
  const client = usePublicClient({ chainId: sepolia.id });
  const [steps, setSteps] = useState<FundingStep[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Hex>();
  const [confirmed, setConfirmed] = useState<Hex[]>([]);
  const active = useRef(true);
  const locked = useRef(false);
  const scope = useRef(address?.toLowerCase());
  scope.current = address?.toLowerCase();
  const refreshVersion = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function inspect() {
    if (
      !address ||
      !wallet ||
      !client ||
      (await wallet.getChainId()) !== sepolia.id ||
      wallet.account.address.toLowerCase() !== address.toLowerCase() ||
      address.toLowerCase() !== intent.fundingOwner
    )
      throw new Error('Connect the payment owner’s wallet on Sepolia.');
    if (intent.expiresAt <= Math.floor(Date.now() / 1000))
      throw new Error(
        'This request expired. Ask your agent for a new request.',
      );
    if (
      intent.chainId !== sepolia.id ||
      intent.token.toLowerCase() !== d.token.toLowerCase()
    )
      throw new Error('Unsupported payment network or token.');
    const account = intent.account as Address;
    const [registry, tokenId] = await client.readContract({
      address: d.validator,
      abi: nFTOwnerValidatorAbi,
      functionName: 'bindings',
      args: [account],
    });
    if (registry.toLowerCase() !== d.registry.toLowerCase())
      throw new Error('Unregistered payment account.');
    const [owner, registered, code, token, allowance, deposit, fees] =
      await Promise.all([
        client.readContract({
          address: d.registry,
          abi: kernelAccountFactoryAbi,
          functionName: 'ownerOf',
          args: [tokenId],
        }),
        client.readContract({
          address: d.registry,
          abi: kernelAccountFactoryAbi,
          functionName: 'accountOf',
          args: [tokenId],
        }),
        client.getCode({ address }),
        client.readContract({
          address: d.token,
          abi: mockUSDCAbi,
          functionName: 'balanceOf',
          args: [address],
        }),
        client.readContract({
          address: d.token,
          abi: mockUSDCAbi,
          functionName: 'allowance',
          args: [address, account],
        }),
        client.readContract({
          address: d.entryPoint,
          abi: entryPointAbi,
          functionName: 'balanceOf',
          args: [account],
        }),
        client.estimateFeesPerGas(),
      ]);
    if (
      owner.toLowerCase() !== address.toLowerCase() ||
      registered.toLowerCase() !== account.toLowerCase()
    )
      throw new Error(
        'Payment account ownership changed. Ask for a new request.',
      );
    if (connector?.id === 'mandate-dev-wallet')
      await wallet.request({
        method: 'mandate_registerAccount' as never,
        params: [{ account, tokenId: tokenId.toString() }] as never,
      });
    if (code && code !== '0x')
      throw new Error(
        'This wallet needs a separate payment bundler, which is not available yet. Setup has not been requested.',
      );
    return paymentSetupSteps(
      address,
      account,
      BigInt(intent.amount),
      { token, allowance, deposit },
      fees.maxFeePerGas * 2n,
    );
  }
  async function refresh(autoContinue = false) {
    const version = ++refreshVersion.current;
    setError('');
    try {
      const next = await inspect();
      if (!active.current || version !== refreshVersion.current) return;
      setSteps(next);
      if (autoContinue && !next.length) await onReady();
    } catch (e) {
      if (active.current && version === refreshVersion.current) {
        setSteps(undefined);
        setError(e instanceof Error ? e.message : 'Could not check funding.');
      }
    }
  }
  useEffect(() => {
    setSteps(undefined);
    void refresh(true);
    return () => {
      refreshVersion.current++;
    };
  }, [
    address,
    wallet,
    client,
    intent.account,
    intent.amount,
    intent.expiresAt,
    intent.fundingOwner,
    intent.token,
    intent.chainId,
  ]);

  async function nextStep() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      if (!client || !wallet || !address)
        throw new Error('Connect your wallet first.');
      let hash = pending;
      if (!hash) {
        const fresh = await inspect();
        if (!active.current) return;
        let step = fresh[0];
        const shown = steps?.[0];
        if (step) {
          step = reuseReviewedGasQuote(step, shown);
          fresh[0] = step;
        }
        setSteps(fresh);
        if (!step) {
          await onReady();
          return;
        }
        // A changed quote needs a fresh user tap before a wallet request.
        if (
          !shown ||
          step.kind !== shown.kind ||
          step.data !== shown.data ||
          step.value !== shown.value
        ) {
          setError(
            'Funding requirements changed. Review the updated step and continue.',
          );
          return;
        }
        const native = await client.getBalance({ address });
        const gas = await client.estimateGas({
          account: address,
          to: step.to,
          data: step.data,
          value: step.value,
        });
        const fees = await client.estimateFeesPerGas();
        if (native < step.value + gas * fees.maxFeePerGas * 2n)
          throw new Error(
            'Your wallet needs more Sepolia ETH for this step and its transaction fee. Add test ETH to your wallet, then retry.',
          );
        if (
          !active.current ||
          scope.current !== address.toLowerCase() ||
          intent.expiresAt <= Math.floor(Date.now() / 1000)
        )
          throw new Error('Wallet or request changed. Review again.');
        if (
          (await wallet.getChainId()) !== sepolia.id ||
          !(await wallet.getAddresses()).some(
            (a) => a.toLowerCase() === intent.fundingOwner,
          )
        )
          throw new Error('Wallet changed. Review again.');
        hash = await wallet.sendTransaction({
          account: address,
          chain: sepolia,
          to: step.to,
          data: step.data,
          value: step.value,
        });
        if (active.current) setPending(hash);
      }
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (!active.current) return;
      setPending(undefined);
      if (receipt.status !== 'success')
        throw new Error('Setup transaction reverted. Check funding and retry.');
      setConfirmed((h) => [...h, hash]);
      const remaining = await inspect();
      if (!active.current) return;
      setSteps(remaining);
      if (!remaining.length) await onReady();
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error
            ? e.message
            : 'Setup failed. Retry the current step.',
        );
    } finally {
      locked.current = false;
      onBusyChange(false);
      if (active.current) setBusy(false);
    }
  }
  const current = steps?.[0];
  return (
    <div className="review-sheet payment-progress" aria-label="Payment setup">
      <div className="payment-progress-heading">
        <strong>{current ? current.label : 'Preparing payment'}</strong>
        {steps && <span>{confirmed.length + 1} / {confirmed.length + steps.length + 1}</span>}
      </div>
      <p>{current?.detail ?? (steps ? 'Funding is ready. Continue to payment review.' : 'Checking your wallet…')}</p>
      {current?.kind === 'allowance' && (
        <p className="footnote">Unused access remains until you remove it in Wallets.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="primary full-button"
        disabled={busy || (!steps && !pending)}
        onClick={() => void nextStep()}
      >
        {busy ? 'Confirming…' : pending ? 'Check confirmation' : current ? 'Continue in wallet' : 'Review payment'}
      </button>
      <p className="footnote">Your wallet confirms setup first, then the payment.</p>
      <details className="payment-extra-details">
        <summary>Setup details{confirmed.length ? ` · ${confirmed.length} confirmed` : ''}</summary>
        {!!steps?.length && <ol>{steps.map(step => <li key={step.kind}>{step.label}</li>)}</ol>}
        {confirmed.map(hash => (
          <p key={hash}><a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">Setup receipt ↗</a></p>
        ))}
        {pending && <p><a href={`https://sepolia.etherscan.io/tx/${pending}`} target="_blank" rel="noreferrer">Pending transaction ↗</a></p>}
        {!pending && <button className="text-button" disabled={busy} onClick={() => void refresh()}>Refresh funding</button>}
      </details>
    </div>
  );
}
