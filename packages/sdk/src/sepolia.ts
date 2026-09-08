import { wayleaveSepoliaDeployment } from './ens';

/** Sepolia demo deployment; see deployments/sepolia.json for receipts and bytecode hashes. */
export const sepoliaDeployment = {
  chainId: 11155111,
  entryPoint: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
  registry: wayleaveSepoliaDeployment.productFactory,
  validator: '0xe4cB1515BD7aC3D43f979392517EB35964A7b7cc',
  token: '0x3C14067e0dbD276c083908C1D9D2f2Dc0A65ca41',
  identityAdapter: wayleaveSepoliaDeployment.identityAdapter,
  ensRegistry: wayleaveSepoliaDeployment.userRegistry,
  ensResolver: wayleaveSepoliaDeployment.resolver,
  demoAccount: '0x2f86Ce1feCa9b2B722Bab2b402c9fA24F613b60A',
  demoName: 'research-desk.wayleave.eth',
} as const;
