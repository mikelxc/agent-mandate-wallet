import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  createPublicClient,
  decodeFunctionData,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
  parseEther,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  entryPointAbi,
  kernelAbi,
  kernelAccountFactoryAbi,
  mockUSDCAbi,
  sepoliaDeployment as deployment,
  validLabel,
} from '../../packages/sdk/src';

const run = promisify(execFile);
const keyStore = fileURLToPath(
  new URL('../../.secrets/sepolia-deployer.json', import.meta.url),
);
const passwordFile = fileURLToPath(
  new URL('../../.secrets/sepolia-deployer.password', import.meta.url),
);
const rpcUrl =
  process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const credentials = ['--keystore', keyStore, '--password-file', passwordFile];
const maxDemoAmount = 100_000_000n;
const gasDeposit = parseEther('0.005');

type RpcRequest = { id?: unknown; method?: unknown; params?: unknown };
type Transaction = { from?: Address; to?: Address; data?: Hex; value?: Hex };
type UserOperation = {
  sender: Address;
  callData: Hex;
  signature: Hex;
  initCode: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint | Hex;
  gasFees: Hex;
  paymasterAndData: Hex;
  [key: string]: unknown;
};

function bigint(value: unknown) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' || typeof value === 'string')
    return BigInt(value);
  throw new Error('Invalid integer value.');
}

function localRequest(req: IncomingMessage) {
  if (req.headers['x-mandate-dev-wallet'] !== '1') return false;
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (!host || !origin) return false;
  const hostname = host.split(':')[0];
  return (
    (hostname === '127.0.0.1' || hostname === 'localhost') &&
    origin === `http://${host}`
  );
}

async function cast(args: string[]) {
  const { stdout } = await run('cast', args, {
    maxBuffer: 1024 * 1024,
    timeout: 120_000,
  });
  return stdout.trim();
}

async function readBody(req: IncomingMessage) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('Request is too large.');
  }
  return JSON.parse(body) as RpcRequest;
}

function decodeAccountExecution(callData: Hex, owner: Address) {
  const execution = decodeFunctionData({ abi: kernelAbi, data: callData });
  if (execution.functionName !== 'execute')
    throw new Error('Only Kernel execute is allowed.');
  const [mode, encoded] = execution.args;
  if (bigint(mode) !== 0n)
    throw new Error('Only a single default execution is allowed.');
  const packed = encoded.slice(2);
  if (packed.length < 104) throw new Error('Malformed Kernel execution.');
  const target = getAddress(`0x${packed.slice(0, 40)}`);
  const callValue = BigInt(`0x${packed.slice(40, 104)}`);
  const tokenCall = `0x${packed.slice(104)}` as Hex;
  if (!isAddressEqual(target, deployment.token) || callValue !== 0n)
    throw new Error('Only the deployed demo token can be called.');
  const transfer = decodeFunctionData({ abi: mockUSDCAbi, data: tokenCall });
  if (transfer.functionName !== 'transferFrom')
    throw new Error('Only transferFrom is allowed.');
  const [from, recipient, amount] = transfer.args;
  if (
    !isAddressEqual(from, owner) ||
    !isAddress(recipient) ||
    /^0x0{40}$/i.test(recipient) ||
    isAddressEqual(recipient, owner) ||
    amount <= 0n ||
    amount > maxDemoAmount
  )
    throw new Error('Payment is outside the local test-wallet limits.');
}

export function createDevWalletHandler(enabled: boolean) {
  if (!enabled || process.env.NODE_ENV !== 'development' || process.env.VERCEL)
    return undefined;
  const allowedAccounts = new Set<string>([
    deployment.demoAccount.toLowerCase(),
  ]);
  const preparedActions = new Map<string, number>();
  let ownerPromise: Promise<Address> | undefined;

  async function owner() {
    ownerPromise ??= cast(['wallet', 'address', ...credentials]).then((value) =>
      getAddress(value),
    );
    return ownerPromise;
  }

  function allowedAccount(value: Address) {
    if (!allowedAccounts.has(value.toLowerCase()))
      throw new Error(
        'Account was not created or loaded by this test session.',
      );
  }

  function validateOperation(op: UserOperation, expectedOwner: Address) {
    allowedAccount(op.sender);
    const accountGas = BigInt(op.accountGasLimits);
    const gasFees = BigInt(op.gasFees);
    const verificationGas = accountGas >> 128n;
    const callGas = accountGas & ((1n << 128n) - 1n);
    const priorityFee = gasFees >> 128n;
    const maxFee = gasFees & ((1n << 128n) - 1n);
    if (
      op.initCode !== '0x' ||
      op.paymasterAndData !== '0x' ||
      bigint(op.preVerificationGas) > 60_000n ||
      verificationGas > 300_000n ||
      callGas > 300_000n ||
      priorityFee > maxFee ||
      maxFee > 50_000_000_000n
    )
      throw new Error(
        'UserOperation gas or sponsorship is outside the local test-wallet limits.',
      );
    decodeAccountExecution(op.callData, expectedOwner);
  }

  async function prepareOperation(params: unknown, expectedOwner: Address) {
    const [op] = params as [UserOperation];
    validateOperation(op, expectedOwner);
    const hash = await client.readContract({
      address: deployment.entryPoint,
      abi: entryPointAbi,
      functionName: 'getUserOpHash',
      args: [op as never],
    });
    for (const [key, expiry] of preparedActions) {
      if (expiry <= Date.now()) preparedActions.delete(key);
    }
    if (preparedActions.size >= 128)
      throw new Error('Too many pending test signatures.');
    preparedActions.set(hash.toLowerCase(), Date.now() + 60_000);
    return hash;
  }

  async function registerAccount(params: unknown, expectedOwner: Address) {
    const [{ account, tokenId }] = params as [
      { account: Address; tokenId: string | number },
    ];
    const id = bigint(tokenId);
    const [registered, currentOwner, code] = await Promise.all([
      client.readContract({
        address: deployment.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'accountOf',
        args: [id],
      }),
      client.readContract({
        address: deployment.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'ownerOf',
        args: [id],
      }),
      client.getCode({ address: account }),
    ]);
    if (
      !code ||
      code === '0x' ||
      !isAddressEqual(registered, account) ||
      !isAddressEqual(currentOwner, expectedOwner)
    )
      throw new Error(
        'Only a deployed account owned by the local test signer can be loaded.',
      );
    allowedAccounts.add(account.toLowerCase());
    return true;
  }

  async function signTypedData(params: unknown, expectedOwner: Address) {
    const [requestedOwner, raw] = params as [Address, string | object];
    if (!isAddressEqual(requestedOwner, expectedOwner))
      throw new Error('Unexpected signer.');
    const typed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const domain = typed.domain as Record<string, unknown>;
    const message = typed.message as Record<string, unknown>;
    if (
      typed.primaryType !== 'AccountAuthorization' ||
      domain.name !== 'Mandate NFT Owner Validator' ||
      domain.version !== '1' ||
      bigint(domain.chainId) !== BigInt(sepolia.id) ||
      !isAddressEqual(domain.verifyingContract as Address, deployment.validator)
    )
      throw new Error('Typed data is outside the test authorization domain.');
    const account = getAddress(message.account as string);
    const tokenId = bigint(message.tokenId);
    const epoch = bigint(message.epoch);
    const actionHash = String(message.actionHash).toLowerCase();
    allowedAccount(account);
    const expiry = preparedActions.get(actionHash);
    preparedActions.delete(actionHash);
    if (!expiry || expiry < Date.now())
      throw new Error('UserOperation was not prepared by this UI session.');
    const [registered, currentOwner, currentEpoch] = await Promise.all([
      client.readContract({
        address: deployment.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'accountOf',
        args: [tokenId],
      }),
      client.readContract({
        address: deployment.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      client.readContract({
        address: deployment.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'ownershipEpoch',
        args: [tokenId],
      }),
    ]);
    if (
      !isAddressEqual(registered, account) ||
      !isAddressEqual(currentOwner, expectedOwner) ||
      currentEpoch !== epoch
    )
      throw new Error('Account ownership changed before signing.');
    return cast([
      'wallet',
      'sign',
      JSON.stringify(typed),
      '--data',
      ...credentials,
    ]);
  }

  async function sendTransaction(params: unknown, expectedOwner: Address) {
    const [tx] = params as [Transaction];
    if (
      !tx?.to ||
      !tx.data ||
      !tx.from ||
      !isAddressEqual(tx.from, expectedOwner)
    )
      throw new Error('Malformed transaction request.');
    const to = getAddress(tx.to);
    const value = tx.value ? bigint(tx.value) : 0n;
    const decoded = decodeFunctionData({
      abi: isAddressEqual(to, deployment.registry)
        ? kernelAccountFactoryAbi
        : isAddressEqual(to, deployment.token)
          ? mockUSDCAbi
          : entryPointAbi,
      data: tx.data,
    });

    if (isAddressEqual(to, deployment.registry)) {
      if (decoded.functionName !== 'createAccountChecked' || value !== 0n)
        throw new Error('Only checked account creation is allowed.');
      const [label, expectedId] = decoded.args;
      if (!validLabel(label)) throw new Error('Invalid account label.');
      const [nextId, predicted] = await client.readContract({
        address: deployment.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'nextAccountAddress',
      });
      if (nextId !== expectedId) throw new Error('Account prediction changed.');
      allowedAccounts.add(predicted.toLowerCase());
    } else if (isAddressEqual(to, deployment.token)) {
      if (decoded.functionName === 'mint') {
        const [recipient, amount] = decoded.args;
        if (
          !isAddressEqual(recipient, expectedOwner) ||
          amount <= 0n ||
          amount > maxDemoAmount
        )
          throw new Error('Mint is outside the local test-wallet limits.');
      } else if (decoded.functionName === 'approve') {
        const [spender, amount] = decoded.args;
        allowedAccount(spender);
        if (amount > maxDemoAmount)
          throw new Error('Approval exceeds the local test-wallet limit.');
      } else throw new Error('Only demo mint and capped approval are allowed.');
      if (value !== 0n) throw new Error('Token calls cannot transfer ETH.');
    } else if (isAddressEqual(to, deployment.entryPoint)) {
      if (decoded.functionName === 'depositTo') {
        const [account] = decoded.args;
        allowedAccount(account);
        if (value !== gasDeposit)
          throw new Error('Only the fixed 0.005 ETH gas deposit is allowed.');
      } else if (decoded.functionName === 'handleOps') {
        const [ops, beneficiary] = decoded.args;
        if (
          value !== 0n ||
          !isAddressEqual(beneficiary, expectedOwner) ||
          ops.length !== 1
        )
          throw new Error('Only one self-bundled operation is allowed.');
        validateOperation(ops[0] as UserOperation, expectedOwner);
      } else throw new Error('Only depositTo and handleOps are allowed.');
    } else throw new Error('Transaction target is not allowlisted.');

    return cast([
      'send',
      to,
      tx.data,
      '--value',
      value.toString(),
      '--rpc-url',
      rpcUrl,
      '--chain',
      sepolia.id.toString(),
      ...credentials,
      '--async',
    ]);
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    let request: RpcRequest = {};
    try {
      if (req.method !== 'POST' || !localRequest(req))
        throw new Error('Local app origin required.');
      request = await readBody(req);
      const expectedOwner = await owner();
      let result: unknown;
      if (request.method === 'eth_chainId') result = '0xaa36a7';
      else if (
        request.method === 'eth_accounts' ||
        request.method === 'eth_requestAccounts'
      )
        result = [expectedOwner];
      else if (request.method === 'mandate_registerAccount')
        result = await registerAccount(request.params, expectedOwner);
      else if (request.method === 'mandate_prepareUserOperation')
        result = await prepareOperation(request.params, expectedOwner);
      else if (request.method === 'eth_signTypedData_v4')
        result = await signTypedData(request.params, expectedOwner);
      else if (request.method === 'eth_sendTransaction')
        result = await sendTransaction(request.params, expectedOwner);
      else
        throw Object.assign(
          new Error(`Unsupported wallet method: ${String(request.method)}`),
          { code: -32601 },
        );
      res.end(
        JSON.stringify({ jsonrpc: '2.0', id: request.id ?? null, result }),
      );
    } catch (error) {
      const value = error as Error & { code?: number };
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id ?? null,
          error: { code: value.code ?? -32000, message: value.message },
        }),
      );
    }
  };
}
