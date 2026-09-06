import type { EIP1193RequestFn } from 'viem';

type Listener = (...args: unknown[]) => void;

class DevWalletProvider {
  private listeners = new Map<string, Set<Listener>>();

  request = (async (args: Parameters<EIP1193RequestFn>[0]) => {
    if (args.method === 'wallet_switchEthereumChain') {
      const chainId = (args.params as [{ chainId: string }] | undefined)?.[0]
        ?.chainId;
      if (chainId?.toLowerCase() !== '0xaa36a7') {
        throw Object.assign(
          new Error('The local test wallet is Sepolia-only.'),
          {
            code: 4902,
          },
        );
      }
      this.emit('chainChanged', chainId);
      return null;
    }

    if (args.method === 'wallet_requestPermissions') {
      const [account] = (await this.rpc('eth_accounts')) as string[];
      return [
        {
          parentCapability: 'eth_accounts',
          caveats: [{ type: 'restrictReturnedAccounts', value: [account] }],
        },
      ];
    }

    if (args.method === 'wallet_getCapabilities') {
      throw Object.assign(
        new Error('Atomic calls are intentionally disabled.'),
        {
          code: -32601,
        },
      );
    }

    return this.rpc(args.method, args.params);
  }) as EIP1193RequestFn;

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  removeListener(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  private emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  private async rpc(method: string, params?: unknown) {
    const response = await fetch('/__mandate_dev_wallet', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mandate-dev-wallet': '1',
      },
      body: JSON.stringify(
        { jsonrpc: '2.0', id: crypto.randomUUID(), method, params },
        (_key, value) =>
          typeof value === 'bigint' ? `0x${value.toString(16)}` : value,
      ),
    });
    const payload = (await response.json()) as {
      result?: unknown;
      error?: { code: number; message: string };
    };
    if (payload.error) {
      throw Object.assign(new Error(payload.error.message), {
        code: payload.error.code,
      });
    }
    return payload.result;
  }
}

let provider: DevWalletProvider | undefined;

export function getDevWalletProvider() {
  provider ??= new DevWalletProvider();
  return provider;
}
