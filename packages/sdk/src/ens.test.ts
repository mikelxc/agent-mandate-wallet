import { describe, expect, test } from 'bun:test';
import {
  agentEnsName,
  ensV2RegistryAbi,
  ensV2HackathonDeployment,
  hackathonSepolia,
  wayleaveSepoliaDeployment,
} from './ens';

describe('ETHOnline ENSv2 configuration', () => {
  test('uses the dedicated Universal Resolver', () => {
    expect(hackathonSepolia.contracts.ensUniversalResolver.address).toBe(
      ensV2HackathonDeployment.universalResolver,
    );
  });

  test('builds Wayleave agent names', () => {
    expect(agentEnsName('research-desk')).toBe(
      'research-desk.wayleave.eth',
    );
  });

  test('keeps the mounted namespace distinct from protocol contracts', () => {
    expect(wayleaveSepoliaDeployment.userRegistry).not.toBe(
      ensV2HackathonDeployment.ethRegistry,
    );
    expect(ensV2RegistryAbi.length).toBeGreaterThan(0);
  });
});
