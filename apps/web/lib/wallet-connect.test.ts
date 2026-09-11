import { describe, expect, test } from 'bun:test';
import { walletConnectSessionConfig } from './wallet-connect';

describe('WalletConnect session configuration', () => {
  test('requests the supported public testnets while excluding local Anvil', () => {
    expect(walletConnectSessionConfig).toEqual({
      chains: { eip155: ['eip155:11155111', 'eip155:5042002', 'eip155:84532'] },
      defaultChain: 'eip155:11155111',
    });
    expect(walletConnectSessionConfig.chains.eip155).not.toContain(
      'eip155:31337',
    );
  });
});
