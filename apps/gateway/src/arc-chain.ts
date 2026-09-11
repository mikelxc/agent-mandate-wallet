import { createPublicClient, decodeEventLog, erc20Abi, http, isAddress, isAddressEqual, type Address, type Hex, type TransactionReceipt, zeroAddress } from 'viem';
import { arcTestnet, baseSepolia } from 'viem/chains';
import { arcCctpRoute as r, cctpAbi, cctpOwnerPayment, parseCctpIntent, parseCctpMessage, entryPointAbi, kernelAccountFactoryAbi, nFTOwnerValidatorAbi, ownerAuthorization, packedPair, type CctpIntent } from '@mandate/sdk';
import { unpack, type Prepared } from './chain';

export type ArcDeployment = { registry: Address; validator: Address; entryPoint: Address; kernel: Address };
export type CctpSourceReceipt = { transactionHash: Hex; userOpHash: Hex; blockNumber: string; message: Hex; fingerprint: Hex };
export type CctpDestinationReceipt = { transactionHash: Hex; blockNumber: string; nonce: Hex; merchantAmount: string };
export interface ArcChain {
  ownership(account: Address): Promise<{ owner: string; tokenId: string; epoch: string }>;
  prepare(intent: CctpIntent): Promise<Prepared>;
  verifyApproval(intent: CctpIntent, prepared: Prepared, signature: Hex): Promise<boolean>;
  sourceReceipt(intent: CctpIntent, prepared: Prepared, transactionHash: Hex): Promise<CctpSourceReceipt>;
  destinationReceipt(intent: CctpIntent, message: Hex, transactionHash: Hex): Promise<CctpDestinationReceipt>;
}
export function liveArcChain(d: ArcDeployment, rpc = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io', destinationRpc = process.env.BASE_SEPOLIA_RPC_URL ?? 'https://sepolia.base.org'): ArcChain {
  const source = createPublicClient({ chain: arcTestnet, transport: http(rpc) });
  const destination = createPublicClient({ chain: baseSepolia, transport: http(destinationRpc) });
  async function guard() {
    if (await source.getChainId() !== r.sourceChainId || await destination.getChainId() !== r.destinationChainId) throw new Error('Arc Testnet / Base Sepolia RPC required');
    for (const address of [d.registry, d.validator, d.entryPoint, d.kernel, r.tokenMessenger]) {
      const code = address && await source.getCode({ address });
      if (!address || isAddressEqual(address, zeroAddress) || !code || code === '0x') throw new Error('Arc deployment is incomplete');
    }
    const [sourceDomain, destinationDomain, sourceDecimals, destinationDecimals] = await Promise.all([
      source.readContract({ address: r.messageTransmitter, abi: cctpAbi, functionName: 'localDomain' }),
      destination.readContract({ address: r.messageTransmitter, abi: cctpAbi, functionName: 'localDomain' }),
      source.readContract({ address: r.sourceToken, abi: erc20Abi, functionName: 'decimals' }),
      destination.readContract({ address: r.destinationToken, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    if (sourceDomain !== r.sourceDomain || destinationDomain !== r.destinationDomain || sourceDecimals !== 6 || destinationDecimals !== 6) throw new Error('Circle deployment mismatch');
  }
  async function ownership(account: Address) {
    await guard();
    const [registry, id] = await source.readContract({ address: d.validator, abi: nFTOwnerValidatorAbi, functionName: 'bindings', args: [account] });
    if (!isAddressEqual(registry, d.registry)) throw new Error('Account outside Arc registry');
    const [registered, owner, epoch, code] = await Promise.all([
      source.readContract({ address: d.registry, abi: kernelAccountFactoryAbi, functionName: 'accountOf', args: [id] }),
      source.readContract({ address: d.registry, abi: kernelAccountFactoryAbi, functionName: 'ownerOf', args: [id] }),
      source.readContract({ address: d.registry, abi: kernelAccountFactoryAbi, functionName: 'ownershipEpoch', args: [id] }),
      source.getCode({ address: account }),
    ]);
    if (!isAddressEqual(registered, account) || !code || code === '0x') throw new Error('Unregistered Arc account');
    return { owner: owner.toLowerCase(), tokenId: id.toString(), epoch: epoch.toString() };
  }
  async function authority(intent: CctpIntent) {
    const i = parseCctpIntent(intent), own = await ownership(i.account);
    if (!isAddressEqual(own.owner as Address, i.fundingOwner)) throw new Error('Arc funding owner changed');
    const code = await source.getCode({ address: i.fundingOwner });
    if (code && code !== '0x') throw new Error('External EOA owner required for Arc payment');
    return own;
  }
  return {
    ownership,
    async prepare(intent) {
      const own = await authority(intent), fees = await source.estimateFeesPerGas();
      const [balance, allowance, deposit, nonce] = await Promise.all([
        source.readContract({ address: r.sourceToken, abi: erc20Abi, functionName: 'balanceOf', args: [intent.fundingOwner] }),
        source.readContract({ address: r.sourceToken, abi: erc20Abi, functionName: 'allowance', args: [intent.fundingOwner, intent.account] }),
        source.readContract({ address: d.entryPoint, abi: entryPointAbi, functionName: 'balanceOf', args: [intent.account] }),
        source.readContract({ address: d.entryPoint, abi: entryPointAbi, functionName: 'getNonce', args: [intent.account, 0n] }),
      ]);
      const maxFee = fees.maxFeePerGas * 2n;
      if (maxFee > 1_000_000_000_000n) throw new Error('Arc gas price exceeds safety ceiling');
      if (balance < BigInt(intent.amount) || allowance < BigInt(intent.amount)) throw new Error('Fund owner and set capped account USDC allowance');
      if (deposit < maxFee * 1_600_000n) throw new Error('Fund Arc account EntryPoint native USDC gas deposit');
      const op = { sender: intent.account, nonce, initCode: '0x' as Hex, callData: cctpOwnerPayment(intent), accountGasLimits: packedPair(500_000n, 1_000_000n), preVerificationGas: 100_000n, gasFees: packedPair(fees.maxPriorityFeePerGas, maxFee), paymasterAndData: '0x' as Hex, signature: '0x' as Hex };
      const actionHash = await source.readContract({ address: d.entryPoint, abi: entryPointAbi, functionName: 'getUserOpHash', args: [op] });
      return { tokenId: own.tokenId, epoch: own.epoch, actionHash, entryPoint: d.entryPoint, validator: d.validator, op: { ...op, nonce: nonce.toString(), preVerificationGas: op.preVerificationGas.toString() } };
    },
    async verifyApproval(intent, p, signature) {
      const own = await authority(intent);
      if (own.tokenId !== p.tokenId || own.epoch !== p.epoch || !isAddressEqual(p.op.sender, intent.account) || p.op.callData !== cctpOwnerPayment(intent) || !isAddressEqual(p.validator, d.validator) || !isAddressEqual(p.entryPoint, d.entryPoint)) return false;
      const hash = await source.readContract({ address: d.entryPoint, abi: entryPointAbi, functionName: 'getUserOpHash', args: [unpack(p)] });
      if (hash !== p.actionHash) return false;
      if (!await source.verifyTypedData({ address: intent.fundingOwner, ...ownerAuthorization(r.sourceChainId, d.validator, intent.account, BigInt(p.tokenId), BigInt(p.epoch), p.actionHash), signature })) return false;
      await source.simulateContract({ address: d.entryPoint, abi: entryPointAbi, functionName: 'handleOps', args: [[unpack(p, signature)], intent.fundingOwner], account: intent.fundingOwner });
      return true;
    },
    async sourceReceipt(intent, p, hash) {
      await guard();
      const receipt = await source.getTransactionReceipt({ hash });
      return verifyCctpSourceReceipt(d, intent, p, receipt);
    },
    async destinationReceipt(intent, message, hash) {
      await guard();
      const decoded = parseCctpMessage(message, intent, true);
      const receipt = await destination.getTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('Destination mint reverted');
      const tx = await destination.getTransaction({ hash });
      // Direct receiveMessage only: binds this receipt to the exact attested message.
      const { decodeFunctionData } = await import('viem');
      if (!tx.to || !isAddressEqual(tx.to, r.messageTransmitter)) throw new Error('Direct Circle mint transaction required');
      const call = decodeFunctionData({ abi: cctpAbi, data: tx.input });
      if (call.functionName !== 'receiveMessage' || call.args[0].toLowerCase() !== message.toLowerCase()) throw new Error('Destination message mismatch');
      const used = await destination.readContract({ address: r.messageTransmitter, abi: cctpAbi, functionName: 'usedNonces', args: [decoded.nonce], blockNumber: receipt.blockNumber });
      let minted = 0n;
      for (const log of receipt.logs) {
        if (!isAddressEqual(log.address, r.destinationToken)) continue;
        try { const event = decodeEventLog({ abi: erc20Abi, ...log }); if (event.eventName === 'Transfer' && isAddressEqual(event.args.from, zeroAddress) && isAddressEqual(event.args.to, intent.recipient)) minted += event.args.value; } catch { /* unrelated log */ }
      }
      if (used !== 1n || minted !== BigInt(decoded.merchantAmount)) throw new Error('Destination mint effects not verified');
      return { transactionHash: hash, blockNumber: receipt.blockNumber.toString(), nonce: decoded.nonce, merchantAmount: minted.toString() };
    },
  };
}

export function arcDeploymentFromEnv(env: Record<string, string | undefined> = process.env): ArcDeployment | undefined {
  const names = ['ARC_REGISTRY', 'ARC_VALIDATOR', 'ARC_ENTRY_POINT', 'ARC_KERNEL'] as const;
  if (names.every(name => !env[name])) return undefined;
  for (const name of names) if (!env[name] || !isAddress(env[name]!, { strict: false }) || env[name]!.toLowerCase() === zeroAddress) throw new Error(`Missing or invalid ${name}`);
  return { registry: env.ARC_REGISTRY as Address, validator: env.ARC_VALIDATOR as Address, entryPoint: env.ARC_ENTRY_POINT as Address, kernel: env.ARC_KERNEL as Address };
}

export function verifyCctpSourceReceipt(d: Pick<ArcDeployment, 'entryPoint'>, intent: CctpIntent, p: Prepared, receipt: Pick<TransactionReceipt, 'status' | 'logs' | 'blockNumber' | 'transactionHash'>): CctpSourceReceipt {
      if (receipt.status !== 'success') throw new Error('Source transaction reverted');
      let included = false;
      const messages: Hex[] = [];
      for (const log of receipt.logs) {
        try {
          if (isAddressEqual(log.address, d.entryPoint)) {
            const event = decodeEventLog({ abi: entryPointAbi, ...log });
            if (event.eventName === 'UserOperationEvent' && event.args.userOpHash === p.actionHash && isAddressEqual(event.args.sender, intent.account)) {
              if (!event.args.success) throw new Error('Inner source operation failed');
              included = true;
            }
          }
          if (isAddressEqual(log.address, r.messageTransmitter)) {
            const event = decodeEventLog({ abi: cctpAbi, ...log });
            if (event.eventName === 'MessageSent') { try { parseCctpMessage(event.args.message, intent); messages.push(event.args.message); } catch { /* other payment */ } }
          }
        } catch (error) { if (error instanceof Error && error.message === 'Inner source operation failed') throw error; }
      }
      if (!included || messages.length !== 1) throw new Error('Matching successful source operation and unique Circle message required');
      return { transactionHash: receipt.transactionHash, userOpHash: p.actionHash, blockNumber: receipt.blockNumber.toString(), message: messages[0], fingerprint: parseCctpMessage(messages[0], intent).fingerprint };
}
