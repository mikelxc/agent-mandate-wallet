import {
  isAddressEqual,
  zeroAddress,
  type Address,
  type PublicClient,
} from 'viem';
import { kernelAccountFactoryAbi, nFTOwnerValidatorAbi } from '@mandate/sdk';

export type WalletDeployment = {
  chainId: number;
  network: string;
  registry: Address;
  validator: Address;
  entryPoint: Address;
  token: Address;
  explorer: string;
  gasSymbol: string;
};
export type OwnedWallet = WalletDeployment & {
  key: string;
  id: string;
  name: string;
  account: Address;
};

// This registry is sequential and has no burn or ERC721Enumerable interface.
// Read current ownership, including handovers, at one consistent block.
export async function discoverOwnedWallets(
  client: PublicClient,
  deployment: WalletDeployment,
  owner: Address,
  signal?: AbortSignal,
): Promise<OwnedWallet[]> {
  if ((await client.getChainId()) !== deployment.chainId)
    throw new Error('Unexpected RPC network');
  const blockNumber = await client.getBlockNumber();
  const contract = {
    address: deployment.registry,
    abi: kernelAccountFactoryAbi,
    blockNumber,
  } as const;
  const end = await client.readContract({
    address: deployment.registry,
    abi: kernelAccountFactoryAbi,
    functionName: 'nextTokenId',
    blockNumber,
  });
  const wallets: OwnedWallet[] = [];
  for (let start = 1n; start < end; start += 20n) {
    signal?.throwIfAborted();
    const ids = Array.from(
      { length: Number(end - start < 20n ? end - start : 20n) },
      (_, i) => start + BigInt(i),
    );
    const batch = await Promise.all(
      ids.map(async (id) => {
        const holder = await client.readContract({
          ...contract,
          functionName: 'ownerOf',
          args: [id],
        });
        if (!isAddressEqual(holder, owner)) return null;
        const [account, name] = await Promise.all([
          client.readContract({
            ...contract,
            functionName: 'accountOf',
            args: [id],
          }),
          client.readContract({
            ...contract,
            functionName: 'labelOf',
            args: [id],
          }),
        ]);
        const [binding, code] = await Promise.all([
          client.readContract({
            address: deployment.validator,
            abi: nFTOwnerValidatorAbi,
            functionName: 'bindings',
            args: [account],
            blockNumber,
          }),
          client.getCode({ address: account, blockNumber }),
        ]);
        if (
          isAddressEqual(account, zeroAddress) ||
          !code ||
          code === '0x' ||
          !isAddressEqual(binding[0], deployment.registry) ||
          binding[1] !== id
        )
          throw new Error(`Wallet #${id} failed registry verification`);
        return {
          ...deployment,
          key: `${deployment.chainId}:${deployment.registry.toLowerCase()}:${id}`,
          id: id.toString(),
          name,
          account,
        };
      }),
    );
    wallets.push(
      ...batch.filter((wallet): wallet is OwnedWallet => wallet !== null),
    );
  }
  signal?.throwIfAborted();
  return wallets;
}
