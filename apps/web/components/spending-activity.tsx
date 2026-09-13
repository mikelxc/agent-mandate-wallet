'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatUnits } from 'viem';
import type { Activity } from '../lib/operations';

/** Shared presentation for Arc and Sepolia; the workspace owns loading and auth. */
export function SpendingActivity({
  rows,
  loaded,
  onRefresh,
}: {
  rows: Activity[];
  loaded: boolean;
  onRefresh: () => void;
}) {
  const [network, setNetwork] = useState('all');
  const visible = rows.filter(
    (row) => network === 'all' || row.kind === network,
  );
  return (
    <section aria-label="Requests and activity">
      <div className="flow-section-heading">
        <h2>Requests &amp; activity</h2>
        <div className="flow-inline-actions">
          <button onClick={onRefresh}>Refresh</button>
        </div>
      </div>
      <div className="payments-filters" aria-label="Spending networks">
        {['all', 'sepolia', 'arc'].map((value) => (
          <button
            key={value}
            aria-pressed={network === value}
            onClick={() => setNetwork(value)}
          >
            {value === 'all'
              ? 'All networks'
              : value === 'arc'
                ? 'Arc → Sepolia'
                : 'Sepolia'}
          </button>
        ))}
      </div>
      {loaded && !visible.length && (
        <div className="flow-surface flow-empty">
          <h3>No requests in this view</h3>
          <p>Requests appear automatically after your agent submits them.</p>
          <Link href="/payments">Try agent checkout →</Link>
        </div>
      )}
      <div className="flow-main">
        {visible.map((row) => (
          <article
            className="flow-surface payment-record"
            key={`${row.kind}:${row.id}`}
          >
            <div className="payment-record-heading">
              <div>
                <span className="flow-eyebrow">
                  {row.kind === 'arc'
                    ? 'Arc Testnet → Ethereum Sepolia'
                    : 'Ethereum Sepolia'}
                </span>
                <h2>
                  <Link
                    href={`/spending?operation=${encodeURIComponent(row.id)}`}
                  >
                    {row.reference}
                  </Link>
                </h2>
              </div>
              <strong className="payment-amount">
                {formatUnits(BigInt(row.amount), 6)} <small>USDC</small>
              </strong>
            </div>
            <p>{row.status}</p>
            {row.kind === 'arc' && (
              <p className="flow-note">
                Source debit · fees reduce recipient amount
              </p>
            )}
            <details className="payment-review">
              <summary>Payment details</summary>
              <dl className="flow-facts">
                <div>
                  <dt>Recipient</dt>
                  <dd style={{ overflowWrap: 'anywhere' }}>{row.recipient}</dd>
                </div>
                <div>
                  <dt>Requested</dt>
                  <dd>{new Date(row.createdAt * 1000).toLocaleString()}</dd>
                </div>
              </dl>
            </details>
            <div className="flow-inline-actions">
              <Link
                className="secondary"
                href={`/spending?operation=${encodeURIComponent(row.id)}`}
              >
                View request →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
