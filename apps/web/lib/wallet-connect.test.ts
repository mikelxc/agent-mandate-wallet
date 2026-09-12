import { describe, expect, spyOn, test } from 'bun:test';
import { ChainController, SIWXUtil, WalletConnectConnector } from '@reown/appkit-controllers';
import { getWalletNetworks, walletConnectSessionConfig } from './wallet-connect';

describe('WalletConnect session configuration', () => {
  test('native authentication only proposes public networks, even when it bypasses the session override', async () => {
    const networks = getWalletNetworks(false).map(network => ({
      ...network,
      chainNamespace: 'eip155' as const,
      caipNetworkId: `eip155:${network.id}` as const,
    }));
    const getNetworks = spyOn(ChainController, 'getCaipNetworks').mockReturnValue(networks);
    const authenticate = spyOn(SIWXUtil, 'universalProviderAuthenticate').mockResolvedValue(false);
    try {
      const connector = new WalletConnectConnector({
        namespace: 'eip155',
        caipNetworks: networks,
        provider: {} as ConstructorParameters<typeof WalletConnectConnector>[0]['provider'],
      });
      await connector.authenticate();
      expect<string[] | undefined>(authenticate.mock.calls[0]?.[0].chains).toEqual(
        walletConnectSessionConfig.chains.eip155,
      );
      expect(authenticate.mock.calls[0]?.[0].chains).not.toContain('eip155:31337');
    } finally {
      authenticate.mockRestore();
      getNetworks.mockRestore();
    }
  });

  test('explicit local test mode retains Anvil for the developer wallet', () => {
    expect(getWalletNetworks(true).map(network => network.id)).toContain(31337);
  });

  test('requests the supported public testnets while excluding local Anvil', () => {
    expect(walletConnectSessionConfig).toEqual({
      chains: { eip155: ['eip155:11155111', 'eip155:5042002'] },
      defaultChain: 'eip155:11155111',
    });
    expect(walletConnectSessionConfig.chains.eip155).not.toContain(
      'eip155:31337',
    );
  });
});
