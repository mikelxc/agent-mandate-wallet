import { describe, expect, test } from 'bun:test';
import { zeroAddress, type Address, type PublicClient } from 'viem';
import { discoverOwnedWallets, type WalletDeployment } from './owned-wallets';

const owner = '0x1111111111111111111111111111111111111111' as Address;
const other = '0x2222222222222222222222222222222222222222' as Address;
const registry = '0x3333333333333333333333333333333333333333' as Address;
const deployment: WalletDeployment = {
  chainId: 11155111,
  network: 'Sepolia',
  registry,
  validator: other,
  entryPoint: other,
  token: other,
  explorer: '',
  gasSymbol: 'ETH',
};
function fixture({
  chainId = deployment.chainId,
  invalidBinding = false,
  failOwner = false,
} = {}) {
  const blocks: bigint[] = [];
  const client = {
    getChainId: async () => chainId,
    getBlockNumber: async () => 100n,
    getCode: async ({ blockNumber }: { blockNumber: bigint }) => {
      blocks.push(blockNumber);
      return '0x1234';
    },
    readContract: async ({
      functionName,
      args,
      blockNumber,
    }: {
      functionName: string;
      args?: [bigint | Address];
      blockNumber: bigint;
    }) => {
      blocks.push(blockNumber);
      const id = args?.[0] as bigint;
      if (functionName === 'nextTokenId') return 24n;
      if (functionName === 'ownerOf') {
        if (failOwner) throw new Error('RPC unavailable');
        // Includes an acquired wallet and excludes a formerly owned wallet.
        return [2n, 22n].includes(id) ? owner : other;
      }
      if (functionName === 'accountOf')
        return `0x${id.toString(16).padStart(40, '0')}`;
      if (functionName === 'labelOf') return `wallet-${id}`;
      if (functionName === 'bindings')
        return [invalidBinding ? zeroAddress : registry, BigInt(args![0])];
      throw new Error('Unexpected read');
    },
  } as unknown as PublicClient;
  return { client, blocks };
}
describe('ownership NFT discovery', () => {
  test('finds all currently owned NFTs across batches without gateway agents or storage', async () => {
    const { client, blocks } = fixture();
    const wallets = await discoverOwnedWallets(client, deployment, owner);
    expect(wallets.map((wallet) => wallet.id)).toEqual(['2', '22']);
    expect(wallets.map((wallet) => wallet.name)).toEqual([
      'wallet-2',
      'wallet-22',
    ]);
    expect(new Set(blocks)).toEqual(new Set([100n]));
  });
  test('the same NFT ID on different chains has a distinct selection key', async () => {
    const first = await discoverOwnedWallets(
      fixture().client,
      deployment,
      owner,
    );
    const second = await discoverOwnedWallets(
      fixture({ chainId: 5042002 }).client,
      { ...deployment, chainId: 5042002 },
      owner,
    );
    expect(first[0].key).not.toBe(second[0].key);
  });
  test('does not trust invalid validator bindings', async () => {
    await expect(
      discoverOwnedWallets(
        fixture({ invalidBinding: true }).client,
        deployment,
        owner,
      ),
    ).rejects.toThrow('registry verification');
  });
  test('reports failed chain reads instead of silently omitting NFTs', async () => {
    await expect(
      discoverOwnedWallets(
        fixture({ failOwner: true }).client,
        deployment,
        owner,
      ),
    ).rejects.toThrow('RPC unavailable');
  });
  test('rejects wrong-chain RPCs', async () => {
    await expect(
      discoverOwnedWallets(fixture({ chainId: 1 }).client, deployment, owner),
    ).rejects.toThrow('Unexpected RPC network');
  });
  test('cancels discovery when the connected owner changes', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      discoverOwnedWallets(
        fixture().client,
        deployment,
        owner,
        controller.signal,
      ),
    ).rejects.toThrow();
  });
});
