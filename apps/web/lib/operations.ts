import type { Operation } from '@mandate/protocol';
import type { CctpOperation } from '../../gateway/src/cctp';

export type SepoliaOperation = Operation & {
  execution?: {
    transactionHash: string;
    success: boolean;
    blockNumber: string;
  };
};
export type Activity = {
  id: string;
  kind: 'sepolia' | 'arc';
  reference: string;
  agentId?: string;
  account: string;
  category: 'approval' | 'progress' | 'paid' | 'archived';
  amount: string;
  recipient: string;
  createdAt: number;
  status: string;
};

export function mergeOperations(
  sepolia: SepoliaOperation[],
  arc: CctpOperation[],
  owner: string,
  now = Date.now() / 1000,
): Activity[] {
  return [
    ...sepolia
      .filter((p) => p.owner.toLowerCase() === owner.toLowerCase())
      .map((p) => ({
        id: p.id,
        kind: 'sepolia' as const,
        reference: p.intent.businessReference,
        agentId: p.agentId,
        account: p.intent.account,
        amount: p.intent.amount,
        recipient: p.intent.recipient,
        createdAt: p.createdAt,
        category: (p.execution
          ? p.execution.success
            ? 'paid'
            : 'archived'
          : p.status === 'rejected' || p.intent.expiresAt <= now
            ? 'archived'
            : p.status === 'approved'
              ? 'progress'
              : 'approval') as Activity['category'],
        status: p.execution
          ? p.execution.success
            ? 'Paid · receipt verified'
            : 'Failed · receipt verified'
          : p.status === 'rejected'
            ? 'Rejected'
            : p.intent.expiresAt <= now
              ? 'Expired'
              : p.status === 'approved'
                ? 'Approved · awaiting receipt'
                : 'Approval required',
      })),
    ...arc
      .filter((p) => p.owner.toLowerCase() === owner.toLowerCase())
      .map((p) => ({
        id: p.id,
        kind: 'arc' as const,
        reference: p.intent.businessReference,
        agentId: p.agentId,
        account: p.intent.account,
        amount: p.intent.amount,
        recipient: p.intent.recipient,
        createdAt: p.createdAt,
        category: (p.destination
          ? 'paid'
          : p.source ||
              p.sourceTransactionHash ||
              p.status !== 'approval_required'
            ? 'progress'
            : 'approval') as Activity['category'],
        status: p.destination
          ? 'Paid · destination receipt verified'
          : p.status === 'destination_ready'
            ? 'Circle attested · awaiting destination receipt'
            : p.source
              ? 'Source receipt verified · awaiting attestation'
              : p.sourceTransactionHash
                ? 'Submitted · awaiting source receipt'
                : p.status === 'approved'
                  ? 'Approved · awaiting source receipt'
                  : 'Approval required',
      })),
  ].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export type ActivityFilters = {
  network: string;
  status: string;
  agent: string;
  search: string;
  days: string;
  group: string;
};
export function groupActivity(
  rows: Activity[],
  filters: ActivityFilters,
  agentNames: Record<string, string>,
  now = Date.now() / 1000,
) {
  const groups = new Map<string, Activity[]>();
  const search = filters.search.trim().toLowerCase();
  for (const row of rows) {
    if (filters.network !== 'all' && row.kind !== filters.network) continue;
    if (filters.status !== 'all' && row.category !== filters.status) continue;
    if (filters.agent !== 'all' && (row.agentId ?? 'manual') !== filters.agent)
      continue;
    if (
      filters.days !== 'all' &&
      row.createdAt < now - Number(filters.days) * 86400
    )
      continue;
    if (
      search &&
      ![
        row.reference,
        row.recipient,
        row.account,
        row.id,
        row.agentId && agentNames[row.agentId],
      ]
        .join(' ')
        .toLowerCase()
        .includes(search)
    )
      continue;
    const key =
      filters.group === 'network'
        ? row.kind === 'arc'
          ? 'Arc → Sepolia'
          : 'Sepolia'
        : filters.group === 'agent'
          ? row.agentId
            ? (agentNames[row.agentId] ?? 'Previous agent connection')
            : 'Manual requests'
          : filters.group === 'status'
            ? {
                approval: 'Awaiting approval',
                progress: 'In progress',
                paid: 'Paid',
                archived: 'Expired, rejected & failed',
              }[row.category]
            : filters.group === 'date'
              ? new Date(row.createdAt * 1000).toLocaleDateString()
              : 'All activity';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups, ([label, records]) => ({ label, records }));
}
