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
        amount: p.intent.amount,
        recipient: p.intent.recipient,
        createdAt: p.createdAt,
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
        amount: p.intent.amount,
        recipient: p.intent.recipient,
        createdAt: p.createdAt,
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
