import { Address, BigInt, Bytes, crypto, dataSource, ethereum } from "@graphprotocol/graph-ts";
import { AccountCreated } from "../generated/Registry/Registry";
import { Transfer } from "../generated/Token/Token";
import { UserOperationEvent } from "../generated/EntryPoint/EntryPoint";
import { Account, PaymentTransfer, UserOperation } from "../generated/schema";

function id(hash: Bytes, index: BigInt): string {
  return dataSource.context().getString("chainId") + ":" + hash.toHexString() + ":" + index.toString();
}
function signature(text: string): Bytes { return Bytes.fromByteArray(crypto.keccak256(Bytes.fromUTF8(text))); }
export function handleAccountCreated(event: AccountCreated): void {
  let account = new Account(event.params.account);
  account.tokenId = event.params.tokenId;
  account.initialOwner = event.params.owner;
  account.registry = event.address;
  account.label = event.params.label;
  account.blockNumber = event.block.number;
  account.save();
}
function transfer(event: ethereum.Event, index: BigInt, account: Bytes, from: Bytes, to: Bytes, amount: BigInt, userOpHash: Bytes | null): void {
  let row = new PaymentTransfer(id(event.transaction.hash, index));
  row.account = account;
  row.token = dataSource.context().getBytes("token");
  row.from = from; row.to = to; row.amount = amount;
  row.transactionHash = event.transaction.hash; row.logIndex = index;
  row.blockNumber = event.block.number; row.blockHash = event.block.hash;
  row.timestamp = event.block.timestamp; row.userOpHash = userOpHash;
  row.save();
}
export function handleTransfer(event: Transfer): void {
  // Direct transfers involving a registered account. Earlier activity is deliberately not backfilled.
  let account: Bytes | null = null;
  if (Account.load(event.params.from) !== null) account = event.params.from;
  else if (Account.load(event.params.to) !== null) account = event.params.to;
  if (account !== null) transfer(event, event.logIndex, account, event.params.from, event.params.to, event.params.value, null);
}
export function handleUserOperation(event: UserOperationEvent): void {
  if (Account.load(event.params.sender) === null) return;
  let row = new UserOperation(id(event.transaction.hash, event.logIndex));
  row.account = event.params.sender; row.transactionHash = event.transaction.hash;
  row.userOpHash = event.params.userOpHash; row.success = event.params.success;
  row.blockNumber = event.block.number; row.blockHash = event.block.hash;
  row.logIndex = event.logIndex; row.timestamp = event.block.timestamp; row.save();
  // The existing owner-funded payment transfers directly owner -> merchant, not through the account.
  // Attribute token effects only inside this EntryPoint execution segment, never the whole receipt.
  let receipt = event.receipt;
  if (receipt === null || !event.params.success) return;
  let boundary = BigInt.fromI32(-1);
  let userOpTopic = signature("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)");
  let beforeTopic = signature("BeforeExecution()");
  let transferTopic = signature("Transfer(address,address,uint256)");
  let logs = receipt.logs;
  for (let i = 0; i < logs.length; i++) {
    let log = logs[i];
    if (log.logIndex.ge(event.logIndex)) break;
    if (log.address.equals(event.address) && log.topics.length > 0 &&
        (log.topics[0].equals(userOpTopic) || log.topics[0].equals(beforeTopic))) boundary = log.logIndex;
  }
  // A receipt without an execution boundary is incomplete; do not guess attribution.
  if (boundary.lt(BigInt.zero())) return;
  for (let i = 0; i < logs.length; i++) {
    let log = logs[i];
    if (log.logIndex.le(boundary) || log.logIndex.ge(event.logIndex)) continue;
    if (!log.address.equals(dataSource.context().getBytes("token")) || log.topics.length != 3 || !log.topics[0].equals(transferTopic)) continue;
    let decoded = ethereum.decode("uint256", log.data);
    if (decoded === null) continue;
    let from = Address.fromBytes(Bytes.fromUint8Array(log.topics[1].subarray(12)));
    let to = Address.fromBytes(Bytes.fromUint8Array(log.topics[2].subarray(12)));
    transfer(event, log.logIndex, event.params.sender, from, to, decoded.toBigInt(), event.params.userOpHash);
  }
}
