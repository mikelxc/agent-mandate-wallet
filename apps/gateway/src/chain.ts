import {
  createPublicClient,
  createWalletClient,
  http,
  isAddressEqual,
  decodeEventLog,
  type Address,
  type Hex,
  keccak256,
  formatEther,
  formatUnits,
  stringToHex,
} from "viem";
import { sepolia } from "viem/chains";
import {
  sepoliaDeployment as d,
  nFTOwnerValidatorAbi,
  kernelAccountFactoryAbi,
  entryPointAbi,
  mockUSDCAbi,
  ownerPayment,
  ownerAuthorization,
  packedPair,
  passkeyAccountFactoryAbi,
  type PasskeyPublicKey,
} from "@mandate/sdk";
import { privateKeyToAccount } from "viem/accounts";
import type { PaymentIntent } from "@mandate/protocol";

/** Only deliberately authored messages may be returned to the browser. */
export class PaymentPreparationError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export function checkPaymentFunding(
  amount: bigint,
  balances: { token: string; allowance: string; deposit: string },
  maxFee: bigint,
) {
  if (maxFee > 50_000_000_000n)
    throw new PaymentPreparationError("fee_ceiling", "Sepolia gas fees exceed the payment safety limit. Try again when fees fall.");
  const missing: string[] = [];
  if (BigInt(balances.token) < amount)
    missing.push(`Your wallet needs ${formatUnits(amount, 6)} demo USDC; it has ${formatUnits(BigInt(balances.token), 6)}.`);
  if (BigInt(balances.allowance) < amount)
    missing.push(`Set a capped token allowance for this account of at least ${formatUnits(amount, 6)} demo USDC (currently ${formatUnits(BigInt(balances.allowance), 6)}).`);
  const required = maxFee * 660_000n;
  if (BigInt(balances.deposit) < required)
    missing.push(`Add at least ${formatEther(required - BigInt(balances.deposit))} Sepolia ETH to this account's gas deposit. ETH in your wallet is separate.`);
  if (missing.length)
    throw new PaymentPreparationError("funding_required", `${missing.join(" ")} Open Account funding settings, load this account, then review again.`);
}

export type Prepared = {
  tokenId: string;
  epoch: string;
  actionHash: Hex;
  entryPoint: Address;
  validator: Address;
  op: {
    sender: Address;
    nonce: string;
    initCode: Hex;
    callData: Hex;
    accountGasLimits: Hex;
    preVerificationGas: string;
    gasFees: Hex;
    paymasterAndData: Hex;
    signature: Hex;
  };
};
export const unpack = (p: Prepared, signature: Hex = "0x") => ({
  ...p.op,
  nonce: BigInt(p.op.nonce),
  preVerificationGas: BigInt(p.op.preVerificationGas),
  signature,
});
export interface Chain {
  ownership(account: string): Promise<{ owner: string; tokenId: string; epoch: string }>;
  verifyLogin(address: string, message: string, signature: Hex): Promise<boolean>;
  balances(account: string, owner: string): Promise<Record<string, string>>;
  prepare(intent: PaymentIntent): Promise<Prepared>;
  verifyApproval(intent: PaymentIntent, prepared: Prepared, signature: Hex): Promise<boolean>;
  receipt(
    prepared: Prepared,
    hash: Hex,
  ): Promise<{
    transactionHash: string;
    userOpHash: string;
    success: boolean;
    blockNumber: string;
  }>;
  passkey?: {
    factory: Address;
    accountAddress(key: PasskeyPublicKey): Promise<Address>;
    registrationDigest(key: PasskeyPublicKey, label: string, deadline: bigint): Promise<Hex>;
    labelAvailable(label: string): Promise<boolean>;
    relay(key: PasskeyPublicKey, label: string, deadline: bigint, proof: Hex): Promise<{ transactionHash: Hex; account: Address; tokenId: string }>;
  };
}
export function liveChain(
  rpc = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
): Chain {
  const c = createPublicClient({ chain: sepolia, transport: http(rpc) });
  const factory = process.env.MANDATE_PASSKEY_FACTORY as Address | undefined;
  const relayerKey = process.env.MANDATE_PASSKEY_RELAYER_KEY as Hex | undefined;
  const passkey = factory ? {
    factory,
    async accountAddress(key: PasskeyPublicKey) {
      return c.readContract({ address: factory, abi: passkeyAccountFactoryAbi, functionName: "accountAddress", args: [key] }) as Promise<Address>;
    },
    async registrationDigest(key: PasskeyPublicKey, label: string, deadline: bigint) {
      return c.readContract({ address: factory, abi: passkeyAccountFactoryAbi, functionName: "registrationDigest", args: [key, label, deadline] }) as Promise<Hex>;
    },
    async labelAvailable(label: string) {
      return !(await c.readContract({ address: factory, abi: passkeyAccountFactoryAbi, functionName: "registeredLabels", args: [keccak256(stringToHex(label))] }));
    },
    async relay(key: PasskeyPublicKey, label: string, deadline: bigint, proof: Hex) {
      if (!relayerKey) throw new Error("Passkey relayer is not configured");
      const account = privateKeyToAccount(relayerKey);
      const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpc) });
      const hash = await wallet.writeContract({ address: factory, abi: passkeyAccountFactoryAbi, functionName: "createAccount", args: [key, label, deadline, proof] });
      const receipt = await c.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Passkey deployment reverted");
      const id = receipt.logs.map((log) => { try { const d = decodeEventLog({ abi: passkeyAccountFactoryAbi, ...log }); return d.eventName === "AccountCreated" ? String((d.args as any).id) : null; } catch { return null; } }).find(Boolean) ?? "0";
      const predicted = await c.readContract({ address: factory, abi: passkeyAccountFactoryAbi, functionName: "accountAddress", args: [key] });
      return { transactionHash: hash, account: predicted as Address, tokenId: id };
    },
  } : undefined;
  async function ownership(account: string) {
    if ((await c.getChainId()) !== sepolia.id) throw new Error("Sepolia RPC required");
    const [registry, id] = await c.readContract({
      address: d.validator,
      abi: nFTOwnerValidatorAbi,
      functionName: "bindings",
      args: [account as Address],
    });
    if (!isAddressEqual(registry, d.registry))
      throw new Error("Account is outside the deployed registry");
    const [registered, owner, epoch, code] = await Promise.all([
      c.readContract({
        address: d.registry,
        abi: kernelAccountFactoryAbi,
        functionName: "accountOf",
        args: [id],
      }),
      c.readContract({
        address: d.registry,
        abi: kernelAccountFactoryAbi,
        functionName: "ownerOf",
        args: [id],
      }),
      c.readContract({
        address: d.registry,
        abi: kernelAccountFactoryAbi,
        functionName: "ownershipEpoch",
        args: [id],
      }),
      c.getCode({ address: account as Address }),
    ]);
    if (!isAddressEqual(registered, account as Address) || !code || code === "0x")
      throw new Error("Unregistered account");
    return { owner: owner.toLowerCase(), tokenId: id.toString(), epoch: epoch.toString() };
  }
  async function balances(account: string, owner: string) {
    const [native, token, allowance, deposit] = await Promise.all([
      c.getBalance({ address: owner as Address }),
      c.readContract({
        address: d.token,
        abi: mockUSDCAbi,
        functionName: "balanceOf",
        args: [owner as Address],
      }),
      c.readContract({
        address: d.token,
        abi: mockUSDCAbi,
        functionName: "allowance",
        args: [owner as Address, account as Address],
      }),
      c.readContract({
        address: d.entryPoint,
        abi: entryPointAbi,
        functionName: "balanceOf",
        args: [account as Address],
      }),
    ]);
    return {
      native: native.toString(),
      token: token.toString(),
      allowance: allowance.toString(),
      deposit: deposit.toString(),
      tokenAddress: d.token,
    };
  }
  async function authority(intent: PaymentIntent) {
    if (intent.token.toLowerCase() !== d.token.toLowerCase())
      throw new PaymentPreparationError("unsupported_token", "Only the demo token is supported");
    const own = await ownership(intent.account);
    if (own.owner !== intent.fundingOwner) throw new PaymentPreparationError("owner_changed", "Funding owner changed. Reject this request and ask your agent for a new one.");
    const code = await c.getCode({ address: intent.fundingOwner as Address });
    if (code && code !== "0x")
      throw new PaymentPreparationError(
        "unsupported_wallet",
        "This wallet requires a separate bundler, which is not configured. Payment submission currently requires an undelegated EOA",
      );
    const b = await balances(intent.account, intent.fundingOwner);
    return { ...own, ...b };
  }
  return {
    ownership,
    balances,
    verifyLogin: (address, message, signature) =>
      c.verifyMessage({ address: address as Address, message, signature }),
    async prepare(intent) {
      const a = await authority(intent);
      const fees = await c.estimateFeesPerGas();
      const maxFee = fees.maxFeePerGas * 2n;
      checkPaymentFunding(BigInt(intent.amount), a, maxFee);
      const op = {
        sender: intent.account as Address,
        nonce: await c.readContract({
          address: d.entryPoint,
          abi: entryPointAbi,
          functionName: "getNonce",
          args: [intent.account as Address, 0n],
        }),
        initCode: "0x" as Hex,
        callData: ownerPayment(
          d.token,
          intent.fundingOwner as Address,
          intent.recipient as Address,
          BigInt(intent.amount),
        ),
        accountGasLimits: packedPair(300_000n, 300_000n),
        preVerificationGas: 60_000n,
        gasFees: packedPair(fees.maxPriorityFeePerGas, maxFee),
        paymasterAndData: "0x" as Hex,
        signature: "0x" as Hex,
      };
      const actionHash = await c.readContract({
        address: d.entryPoint,
        abi: entryPointAbi,
        functionName: "getUserOpHash",
        args: [op],
      });
      return {
        tokenId: a.tokenId,
        epoch: a.epoch,
        actionHash,
        entryPoint: d.entryPoint,
        validator: d.validator,
        op: {
          ...op,
          nonce: op.nonce.toString(),
          preVerificationGas: op.preVerificationGas.toString(),
        },
      };
    },
    async verifyApproval(intent, p, signature) {
      const own = await authority(intent);
      checkPaymentFunding(BigInt(intent.amount), own, BigInt(p.op.gasFees) & ((1n << 128n) - 1n));
      if (own.epoch !== p.epoch || own.tokenId !== p.tokenId) return false;
      const valid = await c.verifyTypedData({
        address: intent.fundingOwner as Address,
        ...ownerAuthorization(
          sepolia.id,
          d.validator,
          intent.account as Address,
          BigInt(p.tokenId),
          BigInt(p.epoch),
          p.actionHash,
        ),
        signature,
      });
      if (!valid) return false;
      await c.simulateContract({
        address: d.entryPoint,
        abi: entryPointAbi,
        functionName: "handleOps",
        args: [[unpack(p, signature)], intent.fundingOwner as Address],
        account: intent.fundingOwner as Address,
      });
      return true;
    },
    async receipt(p, hash) {
      const receipt = await c.getTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Submission reverted");
      for (const log of receipt.logs) {
        if (!isAddressEqual(log.address, d.entryPoint)) continue;
        try {
          const event = decodeEventLog({ abi: entryPointAbi, ...log });
          if (event.eventName === "UserOperationEvent" && event.args.userOpHash === p.actionHash)
            return {
              transactionHash: hash,
              userOpHash: p.actionHash,
              success: event.args.success,
              blockNumber: receipt.blockNumber.toString(),
            };
        } catch {
          /* Unrelated EntryPoint event. */
        }
      }
      throw new Error("Matching operation not included");
    },
  };
}
