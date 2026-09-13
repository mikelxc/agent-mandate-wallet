import { expect, test } from 'bun:test';
import { mergeOperations, type SepoliaOperation } from './operations';
import type { CctpOperation } from '../../gateway/src/cctp';
const owner = '0x1111111111111111111111111111111111111111';
const sepolia = {
  id: 'sepolia',
  owner,
  createdAt: 10,
  status: 'approved',
  intent: {
    businessReference: 'Sepolia purchase',
    amount: '1000000',
    recipient: owner,
    expiresAt: 100,
  },
} as SepoliaOperation;
const arc = {
  id: 'arc',
  owner,
  createdAt: 20,
  status: 'approved',
  intent: {
    businessReference: 'Arc purchase',
    amount: '2000000',
    recipient: owner,
  },
} as unknown as CctpOperation;
test('combines networks newest first, independent of wallet network, and excludes other owners', () => {
  const rows = mergeOperations(
    [sepolia, { ...sepolia, id: 'other', owner: '0x2222' }],
    [arc],
    owner,
    50,
  );
  expect(rows.map((row) => [row.id, row.kind])).toEqual([
    ['arc', 'arc'],
    ['sepolia', 'sepolia'],
  ]);
  expect(rows.every((row) => !row.status.startsWith('Paid'))).toBe(true);
});
test('separates approval, source receipt, Circle attestation and destination settlement', () => {
  const status = (changes: Partial<CctpOperation>) =>
    mergeOperations([], [{ ...arc, ...changes }], owner)[0].status;
  expect(status({ sourceTransactionHash: '0x1234' })).toBe(
    'Submitted · awaiting source receipt',
  );
  expect(
    status({
      source: {
        transactionHash: '0x1234',
      } as unknown as CctpOperation['source'],
    }),
  ).toBe('Source receipt verified · awaiting attestation');
  expect(status({ status: 'destination_ready' })).toBe(
    'Circle attested · awaiting destination receipt',
  );
  expect(
    status({
      destination: {
        transactionHash: '0x1234',
      } as unknown as CctpOperation['destination'],
    }),
  ).toBe('Paid · destination receipt verified');
  expect(
    mergeOperations(
      [
        {
          ...sepolia,
          execution: {
            transactionHash: '0x1234',
            success: false,
            blockNumber: '1',
          },
        },
      ],
      [],
      owner,
    )[0].status,
  ).toBe('Failed · receipt verified');
});
