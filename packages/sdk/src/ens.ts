import { sepolia } from 'viem/chains';
import { parseAbi } from 'viem';

/**
 * ETHOnline 2026's dedicated ENSv2 deployment on Sepolia.
 *
 * This deployment is separate from both production ENS and the standard
 * Sepolia ENSv2 beta. Keep the Universal Resolver override on every client
 * that resolves Wayleave names.
 */
export const ensV2HackathonDeployment = {
  chainId: 11155111,
  parentName: 'wayleave.eth',
  ethRegistry: '0x1d78834d97c1d7b1a38c1dedbd1a287cfed3971e',
  ethRegistrar: '0x7d1b7f586a62ac3f54b9a396849757814283270b',
  publicResolver: '0xf9de4979ddb290baf5b760d0e788125017bc33f6',
  universalResolver: '0xd26f2040d083af1cd2962ba303f4bea0c4faf142',
  verifiableFactory: '0x894bc9cc8ff1ad96b8a288c86a8c71d662c07780',
} as const;

/** Project-owned contracts mounted beneath wayleave.eth on the hackathon deployment. */
export const wayleaveSepoliaDeployment = {
  resolver: '0x44974A0CD84A563BC599Af7ff573B85137B172CB',
  resolverImplementation: '0xa9d3814AB151BF6E37A427432795371a8361614e',
  userRegistry: '0xBBfc3F1f529593ca1aa4D727121Ad4896e66fA34',
  registryImplementation: '0x47B442d0CF617c41CAbAFf5f02f44DD1e5f72546',
  identityAdapter: '0x03AEcb257c931A5eB18F18cCAD9f6d9B584ad44b',
  productFactory: '0xf0C862D40eE1E9637a6B8634E75ebc86aeCCa3dE',
} as const;

export const ensV2RegistryAbi = parseAbi([
  'function getStatus(uint256 anyId) view returns (uint8)',
  'function getOwner(uint256 anyId) view returns (address)',
  'function getResolver(string label) view returns (address)',
  'function getSubregistry(string label) view returns (address)',
]);

export const hackathonSepolia = {
  ...sepolia,
  name: 'Sepolia',
  contracts: {
    ...sepolia.contracts,
    ensUniversalResolver: {
      address: ensV2HackathonDeployment.universalResolver,
    },
  },
} as const;

export function agentEnsName(label: string): string {
  return `${label}.${ensV2HackathonDeployment.parentName}`;
}
