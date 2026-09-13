'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatUnits } from 'viem';
import {
  groupActivity,
  type Activity,
  type ActivityFilters,
} from '../lib/operations';
import type { HubAgent } from './spending-agents';

/** Shared presentation for Arc and Sepolia; the workspace owns loading and auth. */
export function SpendingActivity({
  rows,
  agents,
  loaded,
  onRefresh,
}: {
  rows: Activity[];
  agents: HubAgent[];
  loaded: boolean;
  onRefresh: () => void;
}) {
  const defaults: ActivityFilters = {
    network: 'all',
    status: 'all',
    agent: 'all',
    search: '',
    days: 'all',
    group: 'date',
  };
  const [filters, setFilters] = useState(defaults);
  const change = (key: keyof ActivityFilters, value: string) =>
    setFilters((previous) => ({ ...previous, [key]: value }));
  const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const groups = groupActivity(rows, filters, names);
  const agentIds = [
    ...new Set([
      ...agents.map((a) => a.id),
      ...rows.flatMap((r) => (r.agentId ? [r.agentId] : [])),
    ]),
  ];
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
            aria-pressed={filters.network === value}
            onClick={() => change('network', value)}
          >
            {value === 'all'
              ? 'All networks'
              : value === 'arc'
                ? 'Arc → Sepolia'
                : 'Sepolia'}
          </button>
        ))}
      </div>
      <div className="hub-filters">
        <label>
          Search activity
          <input
            type="search"
            value={filters.search}
            placeholder="Reference, recipient, wallet…"
            onChange={(e) => change('search', e.target.value)}
          />
        </label>
        <label>
          Status
          <select
            aria-label="Status"
            value={filters.status}
            onChange={(e) => change('status', e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="approval">Awaiting approval</option>
            <option value="progress">In progress</option>
            <option value="paid">Paid</option>
            <option value="archived">Expired, rejected &amp; failed</option>
          </select>
        </label>
        <label>
          Agent
          <select
            aria-label="Agent"
            value={filters.agent}
            onChange={(e) => change('agent', e.target.value)}
          >
            <option value="all">All agents</option>
            <option value="manual">Manual requests</option>
            {agentIds.map((id) => (
              <option key={id} value={id}>
                {names[id] ?? `Previous connection · ${id.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Period
          <select
            aria-label="Period"
            value={filters.days}
            onChange={(e) => change('days', e.target.value)}
          >
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </label>
        <label>
          Group by
          <select
            aria-label="Group by"
            value={filters.group}
            onChange={(e) => change('group', e.target.value)}
          >
            <option value="date">Date</option>
            <option value="agent">Agent</option>
            <option value="network">Network</option>
            <option value="status">Status</option>
            <option value="none">No grouping</option>
          </select>
        </label>
        <button onClick={() => setFilters(defaults)}>Reset filters</button>
      </div>
      <p className="flow-note">
        {groups.reduce((sum, g) => sum + g.records.length, 0)} of {rows.length}{' '}
        requests
      </p>
      {loaded && !groups.length && (
        <div className="flow-surface flow-empty">
          <h3>No requests in this view</h3>
          <p>Requests appear automatically after your agent submits them.</p>
          <Link href="/connect">Connect an agent →</Link>
        </div>
      )}
      <div className="flow-main">
        {groups.map((group) => (
          <section
            key={group.label}
            className="hub-activity-group"
            aria-label={group.label}
          >
            <h3>
              {group.label}{' '}
              <span className="hub-count">{group.records.length}</span>
            </h3>
            {group.records.map((row) => (
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
                        href={`/?operation=${encodeURIComponent(row.id)}`}
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
                      <dd style={{ overflowWrap: 'anywhere' }}>
                        {row.recipient}
                      </dd>
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
                    href={`/?operation=${encodeURIComponent(row.id)}`}
                  >
                    View request →
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
