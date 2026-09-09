import { createHash, generateKeyPairSync, sign as signDigest } from 'node:crypto';
import {
  concatHex,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  encodePacked,
  http,
  parseEther,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { foundry } from 'viem/chains';
import { encodePasskeyProof, passkeyCreationCall, passkeyRegistrationChallenge } from '../packages/sdk/src/passkey';

const RPC_URL = 'http://127.0.0.1:8545';
const DAIMO_VERIFIER = '0xc2b78104907F722DABAc4C69f826a522B2754De4' as Address;
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const P256_N_DIV_2 = 57896044605178124381348723474703786764998477612067880171211129530534256022184n;

const transport = http(RPC_URL);
const publicClient = createPublicClient({ chain: foundry, transport });
const chainId = await publicClient.getChainId();
if (chainId !== 31337) throw new Error(`passkey smoke requires Anvil chain 31337, got ${chainId}`);

const accounts = await publicClient.request({ method: 'eth_accounts' } as any) as Address[];
const owner = accounts[0];
if (!owner) throw new Error('Anvil must expose an unlocked account');
const wallet = createWalletClient({ chain: foundry, transport, account: owner });

type Artifact = { abi: readonly unknown[]; bytecode: { object: Hex } };
async function artifact(path: string): Promise<Artifact> {
  const value = await Bun.file(`packages/contracts/out/${path}`).json();
  return value as Artifact;
}
async function verifierArtifact(): Promise<Artifact> {
  for (const path of ['PasskeyAccount.t.sol/SoftwareP256Verifier.json', 'PasskeyAccount.t.sol/P256VerifierShim.json']) {
    if (await Bun.file(`packages/contracts/out/${path}`).exists()) return artifact(path);
  }
  throw new Error('missing test-only SoftwareP256Verifier artifact; run forge build first');
}
async function deploy(path: string, args: readonly unknown[] = []): Promise<Address> {
  const item = await artifact(path);
  const hash = await wallet.deployContract({ abi: item.abi, bytecode: item.bytecode.object, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`deployment failed: ${path}`);
  return receipt.contractAddress;
}
async function tx(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`transaction reverted: ${hash}`);
}

function derInteger(bytes: Uint8Array, offset: number): { value: bigint; next: number } {
  if (bytes[offset] !== 0x02) throw new Error('unexpected P256 DER integer');
  const length = bytes[offset + 1];
  const start = offset + 2;
  return { value: BigInt(`0x${Buffer.from(bytes.slice(start, start + length)).toString('hex')}`), next: start + length };
}
function parseDerSignature(der: Uint8Array): { r: bigint; s: bigint } {
  if (der[0] !== 0x30) throw new Error('unexpected P256 DER sequence');
  const r = derInteger(der, 2);
  const s = derInteger(der, r.next);
  return { r: r.value, s: s.value > P256_N_DIV_2 ? P256_N - s.value : s.value };
}

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
const publicPoint = publicKeyDer.subarray(publicKeyDer.length - 65);
const keyX = BigInt(`0x${publicPoint.subarray(1, 33).toString('hex')}`);
const keyY = BigInt(`0x${publicPoint.subarray(33).toString('hex')}`);

function clientData(challenge: Hex): string {
  const challengeB64 = Buffer.from(challenge.slice(2), 'hex').toString('base64url');
  return `{"type":"webauthn.get","challenge":"${challengeB64}","origin":"http://localhost:3000"}`;
}
function proof(digest: Hex, usePrecompiled = false): Hex {
  const authenticatorData = concatHex(['0x', toHex(new Uint8Array(32)), '0x05', '0x00000000']);
  const client = clientData(digest);
  const message = Buffer.concat([Buffer.from(authenticatorData.slice(2), 'hex'), createHash('sha256').update(client).digest()]);
  const { r, s } = parseDerSignature(signDigest('sha256', message, privateKey));
  return encodePasskeyProof(authenticatorData, client, 1n, r, s, usePrecompiled);
}

const entryPointArtifact = await artifact('EntryPoint.sol/EntryPoint.json');
const entryPoint = await deploy('EntryPoint.sol/EntryPoint.json');
const kernelUups = await deploy('KernelUUPS.sol/KernelUUPS.json', [entryPoint]);
const kernelImmutable = await deploy('KernelImmutableECDSA.sol/KernelImmutableECDSA.json', [entryPoint]);
const kernelFactory = await deploy('KernelFactory.sol/KernelFactory.json', [kernelUups, kernelImmutable]);
const validator = await deploy('WebAuthnValidator.sol/WebAuthnValidator.json');
const factory = await deploy('PasskeyAccountFactory.sol/PasskeyAccountFactory.json', [zeroAddress, kernelFactory, validator]);

// Anvil's Prague VM does not provide the RIP-7212 precompile. The test-only
// SoftwareP256Verifier artifact is installed at the upstream fallback address.
const softwareVerifier = await verifierArtifact();
const verifierConstructor = (softwareVerifier.abi as readonly { type?: string; inputs?: readonly unknown[] }[])
  .find((item) => item.type === 'constructor');
if (verifierConstructor?.inputs?.length) {
  throw new Error('stale P256VerifierShim artifact: rebuild after installing zero-argument SoftwareP256Verifier');
}
const verifierHash = await wallet.deployContract({ abi: softwareVerifier.abi, bytecode: softwareVerifier.bytecode.object });
const verifierReceipt = await publicClient.waitForTransactionReceipt({ hash: verifierHash });
const verifierCode = await publicClient.getCode({ address: verifierReceipt.contractAddress! });
if (!verifierCode) throw new Error('software P256 verifier has no runtime code');
await publicClient.request({ method: 'anvil_setCode', params: [DAIMO_VERIFIER, verifierCode] } as any);

const factoryAbi = (await artifact('PasskeyAccountFactory.sol/PasskeyAccountFactory.json')).abi;
const entryPointAbi = entryPointArtifact.abi;
const deadline = (await publicClient.getBlock()).timestamp + 600n;
const label = 'passkey-smoke';
const account = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'accountAddress', args: [{ x: keyX, y: keyY }] }) as Address;
const digest = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'registrationDigest', args: [{ x: keyX, y: keyY }, label, deadline] }) as Hex;
const key = { x: keyX, y: keyY };
if (passkeyRegistrationChallenge(chainId, factory, key, account, label, deadline) !== digest) throw new Error('SDK challenge differs from onchain digest');
await tx(await wallet.sendTransaction(passkeyCreationCall(factory, key, label, deadline, proof(digest))));
const nftOwner = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'ownerOf', args: [1n] }) as Address;
const registeredAccount = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'accountOf', args: [1n] }) as Address;
if (nftOwner.toLowerCase() !== account.toLowerCase() || registeredAccount.toLowerCase() !== account.toLowerCase()) throw new Error('NFT owner or registered account differs from prediction');
const installed = await publicClient.readContract({ address: validator, abi: (await artifact('WebAuthnValidator.sol/WebAuthnValidator.json')).abi, functionName: 'webAuthnValidatorStorage', args: [account] }) as readonly [bigint, bigint];
if (installed[0] !== keyX || installed[1] !== keyY) throw new Error('installed passkey does not match generated key');

await tx(await wallet.sendTransaction({ to: account, value: parseEther('0.1') }));
const recipient = accounts[1];
if (!recipient) throw new Error('Anvil must expose a second unlocked account');
const recipientBefore = await publicClient.getBalance({ address: recipient });
const callData = encodePacked(['address', 'uint256', 'bytes'], [recipient, parseEther('0.01'), '0x']);
const kernelAbi = (await artifact('Kernel.sol/Kernel.json')).abi;
const userOp = {
  sender: account,
  nonce: 0n,
  initCode: '0x' as Hex,
  callData: encodeFunctionData({ abi: kernelAbi, functionName: 'execute', args: ['0x0000000000000000000000000000000000000000000000000000000000000000', callData] }),
  accountGasLimits: (`0x${(700000n << 128n | 700000n).toString(16).padStart(64, '0')}`) as Hex,
  preVerificationGas: 60000n,
  gasFees: (`0x${(1000000000n << 128n | 1000000000n).toString(16).padStart(64, '0')}`) as Hex,
  paymasterAndData: '0x' as Hex,
  signature: '0x' as Hex,
};
const userOpHash = await publicClient.readContract({ address: entryPoint, abi: entryPointAbi, functionName: 'getUserOpHash', args: [userOp] }) as Hex;
userOp.signature = proof(userOpHash);
await tx(await wallet.writeContract({ address: entryPoint, abi: entryPointAbi, functionName: 'handleOps', args: [[userOp], owner] }));
const balance = await publicClient.getBalance({ address: recipient });
if (balance !== recipientBefore + parseEther('0.01')) throw new Error('passkey UserOp payment was not received');

console.log(JSON.stringify({ chainId, factory, validator, account, checks: ['chain guard', 'deploy', 'deterministic account', 'self-owned NFT', 'installed key', 'passkey UserOp payment'], note: 'local-only; SoftwareP256Verifier installed with anvil_setCode; not a live deployment' }, null, 2));
