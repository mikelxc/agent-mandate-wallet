'use client';

import { useEffect, useRef, useState } from 'react';
import { useConnection } from 'wagmi';
import Link from 'next/link';
import {
  Check,
  Circle,
  Download,
  RefreshCw,
  ReceiptText,
  ArrowRight,
} from 'lucide-react';
import {
  verifyDelivery,
  type Offering,
  type Purchase,
  type PurchaseDelivery,
} from 'wayleave-merchant';
import { gatewayResponse } from '../lib/gateway-response';
import {
  formatUsdc,
  purchaseProgress,
  purchaseStatus,
} from '../lib/merchant-purchase';
import './purchase-tracker.css';

export function PurchaseTracker({
  purchaseId,
  onPurchased,
}: {
  purchaseId?: string;
  onPurchased?: (owner: string) => void;
}) {
  const { address } = useConnection();
  return (
    <OwnerPurchaseTracker
      key={`${address ?? 'disconnected'}:${purchaseId ?? 'latest'}`}
      owner={address}
      purchaseId={purchaseId}
      onPurchased={onPurchased}
    />
  );
}
function OwnerPurchaseTracker({
  owner,
  purchaseId,
  onPurchased,
}: {
  owner?: string;
  purchaseId?: string;
  onPurchased?: (owner: string) => void;
}) {
  const [purchase, setPurchase] = useState<Purchase>();
  const [records, setRecords] = useState<Purchase[]>([]);
  const [offering, setOffering] = useState<Offering>();
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [lastChecked, setLastChecked] = useState<number>();
  const selectedId = useRef(purchaseId);
  const active = useRef(true);
  const inFlight = useRef(false);
  const onComplete = useRef(onPurchased);
  onComplete.current = onPurchased;
  const controller = useRef<AbortController | undefined>(undefined);
  async function refresh() {
    if (!owner || inFlight.current || !active.current) return;
    inFlight.current = true;
    setBusy(true);
    const request = new AbortController();
    controller.current = request;
    try {
      const response = await fetch(
        purchaseId
          ? `/gateway/merchant/purchases/${encodeURIComponent(purchaseId)}`
          : '/gateway/merchant/purchases',
        {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: request.signal,
        },
      );
      const value = await gatewayResponse<Purchase | { purchases: Purchase[] }>(
        response,
      );
      const next = ('purchases' in value ? value.purchases : [value]).filter(
        (p) =>
          p.quote.offering.id === 'wayleave-developer-pack' &&
          p.quote.fundingOwner.toLowerCase() === owner.toLowerCase(),
      );
      let record = selectedId.current
        ? next.find((p) => p.id === selectedId.current)
        : next[0];
      if (!record && selectedId.current && !purchaseId) {
        record = await gatewayResponse<Purchase>(
          await fetch(
            `/gateway/merchant/purchases/${encodeURIComponent(selectedId.current)}`,
            {
              credentials: 'same-origin',
              cache: 'no-store',
              signal: request.signal,
            },
          ),
        );
        if (
          record.quote.fundingOwner.toLowerCase() !== owner.toLowerCase() ||
          record.quote.offering.id !== 'wayleave-developer-pack'
        )
          throw new Error('Purchase does not match this owner.');
        next.push(record);
      }
      if (!active.current || request.signal.aborted) return;
      if (record) selectedId.current = record.id;
      setRecords(next);
      setPurchase(record);
      setChecked(true);
      setError('');
      setLastChecked(Date.now());
      if (record && purchaseProgress(record)[4].complete)
        onComplete.current?.(owner);
    } catch (e) {
      if (active.current && !request.signal.aborted)
        setError(e instanceof Error ? e.message : 'Could not check purchase');
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    active.current = true;
    const catalog = new AbortController();
    void fetch('/gateway/merchant/offerings', { signal: catalog.signal })
      .then(gatewayResponse<{ offerings: Offering[] }>)
      .then((v) => {
        if (!catalog.signal.aborted)
          setOffering(
            v.offerings.find((o) => o.id === 'wayleave-developer-pack'),
          );
      })
      .catch(() => {});
    void refresh();
    const checkVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const sessionChanged = (event: Event) => {
      if (!(event as CustomEvent).detail) {
        controller.current?.abort();
        setPurchase(undefined);
        setRecords([]);
        setChecked(false);
        setLastChecked(undefined);
        setError('Sign in to check your purchase.');
        selectedId.current = purchaseId;
      } else checkVisible();
    };
    const timer = window.setInterval(checkVisible, 10000);
    document.addEventListener('visibilitychange', checkVisible);
    window.addEventListener('wayleave:owner-session', sessionChanged);
    return () => {
      active.current = false;
      catalog.abort();
      controller.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkVisible);
      window.removeEventListener('wayleave:owner-session', sessionChanged);
    };
  }, []);
  async function download() {
    if (!purchase || !owner || downloading) return;
    setDownloading(true);
    setError('');
    try {
      const delivery = await gatewayResponse<PurchaseDelivery>(
        await fetch(
          `/gateway/merchant/purchases/${encodeURIComponent(purchase.id)}/delivery`,
          { credentials: 'same-origin', cache: 'no-store' },
        ),
      );
      await verifyDelivery(delivery, purchase.quote.offering.contentSha256);
      if (
        delivery.purchaseId !== purchase.id ||
        delivery.offeringId !== purchase.quote.offering.id ||
        delivery.version !== purchase.quote.offering.version
      )
        throw new Error('Delivery does not match this purchase.');
      if (!active.current) return;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(delivery, null, 2)], {
          type: 'application/json',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `wayleave-developer-pack-${delivery.version}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await refresh();
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : 'Could not retrieve pack');
    } finally {
      if (active.current) setDownloading(false);
    }
  }
  const terms = purchase?.quote.offering ?? offering;
  return (
    <section
      className="purchase-tracker"
      aria-label="Developer Pack purchase tracker"
    >
      <div className="purchase-tracker-top">
        <span>
          <ReceiptText size={18} /> YOUR FIRST PURCHASE
        </span>
        <span>Test USDC</span>
      </div>
      <h3>Wayleave Developer Pack</h3>
      <div className="purchase-tracker-price">
        {terms ? formatUsdc(terms.price) : '—'} <small>USDC</small>
      </div>
      <p className="purchase-tracker-status" role="status">
        {error && purchase
          ? 'Status unavailable · showing last verified update'
          : purchaseStatus(purchase)}
      </p>
      {!purchase && (
        <p>
          {owner
            ? checked
              ? 'No request yet. Ask your agent to visit the store and request this purchase.'
              : 'Checking for a purchase from your agent.'
            : 'Connect and sign in to follow your agent’s purchase here.'}
        </p>
      )}
      {(purchase?.paymentStatus === 'attestation_pending' ||
        purchase?.paymentStatus === 'destination_ready') && (
        <p>
          Continue in Payments to check the Circle attestation and submit the
          destination transaction.
        </p>
      )}
      <ol aria-label="Verified purchase progress">
        {purchaseProgress(purchase).map((stage, i) => (
          <li key={stage.label} data-complete={stage.complete}>
            <span>
              {stage.complete ? <Check size={15} /> : <Circle size={15} />}
            </span>
            <div>
              {stage.label}
              <small>
                {stage.complete
                  ? 'Verified'
                  : i === 0 && !purchase
                    ? 'Waiting for a request'
                    : 'Not yet verified'}
              </small>
            </div>
          </li>
        ))}
      </ol>
      {terms && (
        <p className="purchase-tracker-note">
          Merchant price {formatUsdc(terms.price)} USDC.{' '}
          {purchase
            ? `Payment debit cap ${formatUsdc(purchase.quote.sourceDebit)}`
            : `Transfer fee cap ${formatUsdc(terms.maxTransferFee)}`}{' '}
          USDC, plus gas.
        </p>
      )}
      {records.length > 1 && !purchaseId && (
        <label>
          Tracked purchase
          <select
            value={purchase?.id ?? ''}
            disabled={busy}
            onChange={(e) => {
              selectedId.current = e.target.value;
              void refresh();
            }}
          >
            {records.map((p) => (
              <option key={p.id} value={p.id}>
                {new Date(p.quote.createdAt * 1000).toLocaleString()} ·{' '}
                {p.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="purchase-tracker-actions">
        {purchase && (
          <Link
            href={`/payments?request=${encodeURIComponent(purchase.operationId)}&purchase=${encodeURIComponent(purchase.id)}`}
          >
            {purchase.paymentStatus === 'settled'
              ? 'View payment receipt'
              : 'Review & complete payment'}{' '}
            <ArrowRight size={14} />
          </Link>
        )}
        {purchase?.paymentStatus === 'settled' && (
          <button
            disabled={downloading || !!error}
            onClick={() => void download()}
          >
            <Download size={14} />
            {downloading ? 'Retrieving…' : 'Download purchased pack'}
          </button>
        )}
        <button disabled={!owner || busy} onClick={() => void refresh()}>
          <RefreshCw size={13} />
          {busy ? 'Checking…' : 'Check purchase'}
        </button>
      </div>
      {purchase && (
        <details>
          <summary>Payment evidence</summary>
          <p>Purchase {purchase.id}</p>
          {purchase.sourceTransactionHash && (
            <a
              href={`https://testnet.arcscan.app/tx/${purchase.sourceTransactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Verified Arc transaction ↗
            </a>
          )}
          {purchase.destinationTransactionHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${purchase.destinationTransactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Verified merchant receipt ↗
            </a>
          )}
        </details>
      )}
      {lastChecked && (
        <small className="purchase-last-checked">
          Checked {new Date(lastChecked).toLocaleTimeString()} · updates every
          10 seconds while visible
        </small>
      )}
    </section>
  );
}
