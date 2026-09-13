/** Versioned transport contracts. Amounts are integer USDC base units, never floats. */
export type Offering = {
  id: string; version: string; merchant: string; title: string; description: string;
  price: string; maxTransferFee: string; decimals: 6; currency: 'USDC'; testnet: true;
  sourceChainId: number; destinationChainId: number; recipient: string;
  token: string; contentSha256: string; files: string[]; available: boolean;
};
export type PurchaseQuote = {
  version: 1; id: string; offering: Offering; createdAt: number; expiresAt: number;
  sourceDebit: string; minimumMerchantReceipt: string; maximumMerchantReceipt: string;
  maximumTransferFee: string; gasIncluded: false; account: string; fundingOwner: string;
};
export type Purchase = {
  id: string; quote: PurchaseQuote; operationId: string; approvalUrl: string;
  paymentStatus: string; delivery: 'locked' | 'available';
  sourceTransactionHash?: string; destinationTransactionHash?: string;
  merchantAmount?: string; bundleSha256?: string;
};
export type PackFile = { name: string; mediaType: string; content: string; sha256: string };
export type PurchaseDelivery = { purchaseId: string; offeringId: string; version: string; sha256: string; files: PackFile[] };
export function units(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= 1n << 256n) throw new Error('Invalid base-unit amount');
  return BigInt(value);
}
/** Buyer agrees to a bounded debit; unused fee budget reaches the merchant, not a refund. */
export function quoteAmounts(price: string, fee: string) {
  const minimum = units(price), maximumFee = units(fee), debit = minimum + maximumFee;
  if (minimum === 0n || debit >= 1n << 256n) throw new Error('Invalid purchase price');
  return { sourceDebit: debit.toString(), minimumMerchantReceipt: minimum.toString(), maximumMerchantReceipt: debit.toString(), maximumTransferFee: maximumFee.toString(), gasIncluded: false as const };
}
export type MerchantRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
/** Inject an authenticated transport. This package neither holds keys nor discovers credential destinations. */
export function createMerchantClient(request: MerchantRequest) {
  const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const id = (value: string) => encodeURIComponent(value);
  return {
    listOfferings: () => request<{ offerings: Offering[] }>('/merchant/offerings'),
    getPurchaseQuote: (input: { offeringId: string; idempotencyKey: string }) => post<PurchaseQuote>('/agent/merchant/quotes', input),
    requestPurchase: (quoteId: string) => post<Purchase>(`/agent/merchant/quotes/${id(quoteId)}/purchase`, {}),
    getPurchase: (purchaseId: string) => request<Purchase>(`/agent/merchant/purchases/${id(purchaseId)}`),
    getPurchaseDelivery: (purchaseId: string) => request<PurchaseDelivery>(`/agent/merchant/purchases/${id(purchaseId)}/delivery`),
  };
}

/** Validate downloaded bytes against the immutable offering digest. Does not prove payment. */
export async function verifyDelivery(delivery: PurchaseDelivery, expectedSha256: string): Promise<void> {
  const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
  if (!Array.isArray(delivery.files) || delivery.files.length > 100 || delivery.sha256 !== expectedSha256 || await digest(JSON.stringify(delivery.files)) !== expectedSha256) throw new Error('Purchased artifact digest does not match');
  for (const file of delivery.files) {
    if (!file.name || file.name.startsWith('/') || file.name.split('/').some(part => part === '..') || typeof file.content !== 'string' || await digest(file.content) !== file.sha256) throw new Error('Invalid purchased file');
  }
}
