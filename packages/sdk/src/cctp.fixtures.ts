import { encodePacked, padHex, zeroHash, type Hex } from 'viem';
import { arcCctpRoute as r, type CctpIntent } from './cctp';
export const testCctpIntent: CctpIntent = { version: 1, kind: 'cctp_payment', sourceChainId: 5042002, sourceDomain: 26, destinationChainId: 11155111, destinationDomain: 0, sourceToken: r.sourceToken, destinationToken: r.destinationToken, account: '0x1111111111111111111111111111111111111111', fundingOwner: '0x2222222222222222222222222222222222222222', recipient: '0x3333333333333333333333333333333333333333', amount: '1000000', maxFee: '1000', amountSemantics: 'source_debit', minFinalityThreshold: 2000, businessReference: 'invoice-1', idempotencyKey: 'payment-1' };
export function testCctpMessage(attested = false): Hex {
  const i = testCctpIntent;
  return encodePacked(['uint32','uint32','uint32','bytes32','bytes32','bytes32','bytes32','uint32','uint32','uint32','bytes32','bytes32','uint256','bytes32','uint256','uint256','uint256'], [1,26,0,attested ? padHex('0x42', { size: 32 }) : zeroHash,padHex(r.tokenMessenger,{size:32}),padHex(r.tokenMessenger,{size:32}),zeroHash,2000,attested ? 2000 : 0,1,padHex(i.sourceToken,{size:32}),padHex(i.recipient,{size:32}),1000000n,padHex(i.account,{size:32}),1000n,attested ? 500n : 0n,attested ? 50000000n : 0n]);
}
