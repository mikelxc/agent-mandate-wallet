'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useConnection } from 'wagmi';
import { SpendingActivity } from './spending-activity';
import { PurchaseTracker } from './purchase-tracker';
import type { CctpOperation } from '../../gateway/src/cctp';
import {
  mergeOperations,
  type Activity,
  type SepoliaOperation,
} from '../lib/operations';
import { AgentControl } from './agent-control';
import { Payments } from './crosschain-payments';
import './payments.css';
import './agent-flows.css';

async function read<T>(path: string): Promise<T> {
  const response = await fetch(`/gateway${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error ?? 'Could not load requests. Please retry.');
  return value;
}

export function OperationsWorkspace() {
  const query = useSearchParams();
  const operation = query.get('operation') ?? '';
  const directArc = !!query.get('request') || query.get('view') === 'arc';
  const { address } = useConnection();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    owner?: string;
    rows: Activity[];
    errors: string[];
    loaded: boolean;
  }>({ rows: [], errors: [], loaded: false });

  useEffect(() => {
    let cancelled = false;
    setState((previous) =>
      previous.owner === address
        ? previous
        : { owner: address, rows: [], errors: [], loaded: false },
    );
    async function load() {
      if (!address || directArc) return;
      const results = await Promise.allSettled([
        read<SepoliaOperation[]>('/operations'),
        read<{ operations: CctpOperation[] }>('/crosschain').then(
          async (result) => {
            if (
              operation &&
              !result.operations.some((p) => p.id === operation)
            ) {
              const response = await fetch(
                `/gateway/crosschain/${encodeURIComponent(operation)}`,
                { credentials: 'same-origin', cache: 'no-store' },
              );
              if (response.ok) result.operations.push(await response.json());
              else if (response.status !== 404)
                throw new Error(
                  'Could not resolve the linked Arc request. Please retry.',
                );
            }
            return result.operations;
          },
        ),
      ]);
      if (cancelled) return;
      const [sepolia, arc] = results;
      setState({
        owner: address,
        loaded: true,
        rows: mergeOperations(
          sepolia.status === 'fulfilled' ? sepolia.value : [],
          arc.status === 'fulfilled' ? arc.value : [],
          address,
        ),
        errors: results.flatMap((result, index) =>
          result.status === 'rejected'
            ? [
                `${index ? 'Arc' : 'Sepolia'}: ${result.reason instanceof Error ? result.reason.message : 'Could not load requests.'}`,
              ]
            : [],
        ),
      });
    }
    void load();
    const changed = (event?: Event) => {
      if (event && !(event as CustomEvent).detail)
        setState({ owner: address, rows: [], errors: [], loaded: false });
      setRevision((value) => value + 1);
    };
    window.addEventListener('wayleave:owner-session', changed);
    // Inbox polling must not interrupt the active approval flow.
    const timer =
      !operation && !directArc ? setInterval(changed, 30_000) : undefined;
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('wayleave:owner-session', changed);
    };
  }, [address, operation, directArc, revision]);

  const rows = state.owner === address ? state.rows : [];
  const selected = rows.find((row) => row.id === operation);
  if (directArc || selected)
    return (
      <>
        <Link href="/spending">← All spending · Sepolia & Arc</Link>
        {directArc || selected?.kind === 'arc' ? (
          <Payments />
        ) : (
          <AgentControl />
        )}
      </>
    );

  return (
    <section
      className="wl-agent-settings payments-workspace"
      aria-label="All spending"
    >
      <div className="payments-heading">
        <div>
          <span className="flow-eyebrow">YOUR AGENTS, YOUR APPROVAL</span>
          <h1>Spending</h1>
          <p>Requests and payment activity across Sepolia and Arc.</p>
        </div>
        <Link className="secondary" href="/spending?view=arc">
          Create an Arc payment
        </Link>
      </div>
      {!address ? (
        <div className="flow-surface">
          <h2>Connect to review your requests</h2>
          <p>
            Sign in with the owner wallet to load activity from both networks.
          </p>
          <button
            onClick={async () => {
              const { openWalletPicker } = await import('../lib/wallet-config');
              await openWalletPicker();
            }}
          >
            Connect wallet
          </button>
        </div>
      ) : (
        <>
          {state.errors.map((error) => (
            <p role="alert" key={error}>
              {error}
            </p>
          ))}
          {!!state.errors.length && (
            <button
              onClick={async () => {
                try {
                  const { verifyConnectedOwner } =
                    await import('../lib/wallet-config');
                  await verifyConnectedOwner();
                  setRevision((value) => value + 1);
                } catch (error) {
                  setState((previous) => ({
                    ...previous,
                    errors: [
                      error instanceof Error
                        ? error.message
                        : 'Sign-in failed.',
                    ],
                  }));
                }
              }}
            >
              Sign in to load requests
            </button>
          )}
          {!state.loaded && (
            <p role="status">Loading requests from both networks…</p>
          )}
          {state.loaded && operation && (
            <p role="alert">
              {state.errors.length
                ? 'The linked request could not be resolved. Retry after signing in.'
                : 'This request was not found for the connected owner.'}
            </p>
          )}
          {operation && <Link href="/spending">Show all spending</Link>}
          <div className="flow-layout payments-layout">
            <SpendingActivity
              rows={rows}
              loaded={state.loaded && !state.errors.length}
              onRefresh={() => setRevision((value) => value + 1)}
            />
            <aside className="payments-context">
              <PurchaseTracker />
              <details className="flow-disclosure">
                <summary>Understanding payment status</summary>
                <p>
                  Approval authorizes a payment. Source receipts confirm the Arc
                  transaction; Circle attestations allow settlement. A
                  destination receipt confirms the recipient payment.
                </p>
              </details>
              <Link className="payments-identity-link" href="/payments">
                Explore agent checkout →
              </Link>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
