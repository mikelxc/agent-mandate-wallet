import { describe, expect, test } from 'bun:test';
import { walletConnectSessionConfig } from './wallet-connect';

describe('WalletConnect session configuration', () => {
  test('requests only the Sepolia account used by the hosted app', () => {
    expect(walletConnectSessionConfig).toEqual({
      chains: { eip155: ['eip155:11155111'] },
      defaultChain: 'eip155:11155111',
    });
    expect(walletConnectSessionConfig.chains.eip155).not.toContain(
      'eip155:31337',
    );
  });
});
