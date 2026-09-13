import type { Purchase } from 'wayleave-merchant';

export const developerPackPath = '/store/developer-pack';
export const developerPackPublicUrl = `https://www.wayleave.xyz${developerPackPath}`;
export const purchaseInstruction = `Visit ${developerPackPublicUrl} and buy the Wayleave Developer Pack using my connected Wayleave identity. Show me the quote and approval link, then wait for me to complete payment. Retrieve the pack and explain its architecture guide.`;

export function purchaseProgress(purchase?: Purchase) {
  const status = purchase?.paymentStatus;
  const received =
    status === 'settled' &&
    !!purchase?.sourceTransactionHash &&
    !!purchase.destinationTransactionHash;
  const delivered =
    received &&
    purchase?.delivery === 'available' &&
    purchase.bundleSha256 === purchase.quote.offering.contentSha256;
  return [
    { label: 'Purchase requested', complete: !!purchase },
    {
      label: 'Owner approval',
      complete: [
        'approved',
        'attestation_pending',
        'destination_ready',
        'settled',
      ].includes(status ?? ''),
    },
    {
      label: 'Payment sent from Arc',
      complete: !!purchase?.sourceTransactionHash,
    },
    { label: 'USDC received by Wayleave', complete: received },
    { label: 'Developer Pack retrieved', complete: delivered },
  ];
}
export function purchaseStatus(purchase?: Purchase) {
  if (!purchase) return 'Waiting for your agent';
  if (purchaseProgress(purchase)[4].complete) return 'Purchase complete';
  switch (purchase.paymentStatus) {
    case 'approval_required':
      return 'Ready for your approval';
    case 'approved':
      return 'Approved · send payment on Arc';
    case 'attestation_pending':
      return 'Arc payment verified · waiting for Circle';
    case 'destination_ready':
      return 'Ready to complete on Ethereum Sepolia';
    case 'settled':
      return 'Payment received · ready to retrieve';
    default:
      return 'Check payment status';
  }
}
export const formatUsdc = (value: string) => {
  if (!/^\d+$/.test(value)) return 'Unavailable';
  const [whole, fraction] =
    `${BigInt(value) / 1000000n}.${(BigInt(value) % 1000000n).toString().padStart(6, '0')}`.split(
      '.',
    );
  return `${whole}.${fraction.replace(/0+$/, '').padEnd(2, '0')}`;
};
