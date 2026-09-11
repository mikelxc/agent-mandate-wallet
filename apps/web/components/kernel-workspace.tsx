'use client';

import { WayleaveSelect } from '@/components/wayleave-select';
import { useEffect, useRef, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useSwitchChain,
} from 'wagmi';
import { sepolia } from 'viem/chains';
import { getCapabilities, sendCalls, waitForCallsStatus } from 'viem/actions';
import {
  decodeEventLog,
  encodeFunctionData,
  formatEther,
  formatUnits,
  isAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  sepoliaDeployment as d,
  nFTOwnerValidatorAbi,
  kernelAccountFactoryAbi,
  entryPointAbi,
  mockUSDCAbi,
  ownerAuthorization,
  ownerPayment,
  packedPair,
  setupCalls,
  usdc,
  validLabel,
} from '@mandate/sdk';
import { ArrowRight, Wallet } from 'lucide-react';

export function KernelWorkspace({ compact = false }: { compact?: boolean }) {
  const { address, chainId, connector } = useAccount();
  const { data: wallet } = useWalletClient();
  const client = usePublicClient({ chainId: sepolia.id });
  const switcher = useSwitchChain();
  const active = useRef(true);
  const balanceRequest = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [label, setLabel] = useState('research-desk');
  const [account, setAccount] = useState<Address>();
  const [id, setId] = useState<bigint>();
  const [recoverId, setRecoverId] = useState('');
  const [budget, setBudget] = useState('8');
  const [amount, setAmount] = useState('3');
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    'Create an account or load one you already own.',
  );
  const [balances, setBalances] = useState('');
  const [balanceDetails, setBalanceDetails] = useState<{
    token: string;
    allowance: string;
    gas: string;
  }>();
  const [walletChoices, setWalletChoices] = useState<
    Array<{ id: string; name: string; account: string }>
  >([]);
  const [walletLoadError, setWalletLoadError] = useState('');
  useEffect(() => {
    if (!compact || !address || !client) return;
    let cancelled = false;
    setWalletChoices([]);
    setAccount(undefined);
    setId(undefined);
    setBalanceDetails(undefined);
    setWalletLoadError('');
    void fetch('/gateway/agents', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            'Verify your wallet on the Spending page to load its agents.',
          );
        const agents = (await response.json()) as Array<{
          account: Address;
          name: string;
          owner: string;
        }>;
        const seen = new Set<string>();
        const choices = await Promise.all(
          agents
            .filter((agent) => {
              if (
                agent.owner.toLowerCase() !== address.toLowerCase() ||
                seen.has(agent.account.toLowerCase())
              )
                return false;
              seen.add(agent.account.toLowerCase());
              return true;
            })
            .map(async (agent) => {
              const [registry, tokenId] = await client.readContract({
                address: d.validator,
                abi: nFTOwnerValidatorAbi,
                functionName: 'bindings',
                args: [agent.account],
              });
              if (registry.toLowerCase() !== d.registry.toLowerCase())
                throw new Error('Unrecognized spending wallet.');
              return {
                id: tokenId.toString(),
                name: agent.name,
                account: agent.account,
              };
            }),
        );
        if (!cancelled) {
          setWalletChoices(choices);
          if (choices.length) {
            const requested = new URLSearchParams(window.location.search).get(
              'account',
            );
            setRecoverId(
              (
                choices.find(
                  (choice) =>
                    choice.account.toLowerCase() === requested?.toLowerCase(),
                ) ?? choices[0]
              ).id,
            );
          }
        }
      })
      .catch((error) => {
        if (!cancelled)
          setWalletLoadError(
            error instanceof Error ? error.message : 'Could not load wallets.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [compact, address, client]);
  const [hash, setHash] = useState<Hex>();
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      'account',
    );
    if (!client || !requested || !isAddress(requested)) return;
    let cancelled = false;
    void client
      .readContract({
        address: d.validator,
        abi: nFTOwnerValidatorAbi,
        functionName: 'bindings',
        args: [requested],
      })
      .then(([registry, tokenId]) => {
        if (cancelled || registry.toLowerCase() !== d.registry.toLowerCase())
          return;
        setRecoverId(tokenId.toString());
        setMessage(
          `Load account #${tokenId} to manage funding for the payment, then return to review it.`,
        );
      })
      .catch(() => {
        if (!cancelled)
          setMessage(
            'Could not find the requested account. Enter its account ID below.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [client]);
  const ready = !!address && !!wallet && chainId === sepolia.id;
  async function context() {
    if (
      !active.current ||
      !address ||
      !wallet ||
      !client ||
      (await wallet.getChainId()) !== sepolia.id ||
      !(await wallet.getAddresses()).some(
        (a) => a.toLowerCase() === address.toLowerCase(),
      )
    )
      throw new Error('Wallet changed. Reconnect on Sepolia.');
    return { owner: address, wallet, client };
  }
  async function refresh(a = account) {
    if (!address || !client) return;
    const request = ++balanceRequest.current;
    const [eth, token, allowance, gas] = await Promise.all([
      client.getBalance({ address }),
      client.readContract({
        address: d.token,
        abi: mockUSDCAbi,
        functionName: 'balanceOf',
        args: [address],
      }),
      a
        ? client.readContract({
            address: d.token,
            abi: mockUSDCAbi,
            functionName: 'allowance',
            args: [address, a],
          })
        : 0n,
      a
        ? client.readContract({
            address: d.entryPoint,
            abi: entryPointAbi,
            functionName: 'balanceOf',
            args: [a],
          })
        : 0n,
    ]);
    if (!active.current || request !== balanceRequest.current) return;
    if (active.current)
      setBalanceDetails({
        token: formatUnits(token, 6),
        allowance: formatUnits(allowance, 6),
        gas: formatEther(gas),
      });
    if (active.current)
      setBalances(
        `${Number(formatEther(eth)).toFixed(4)} test ETH · ${formatUnits(token, 6)} demo USDC · ${formatUnits(allowance, 6)} approved · ${Number(formatEther(gas)).toFixed(5)} ETH gas deposit`,
      );
  }
  useEffect(() => {
    void refresh().catch(() =>
      setBalances('Balance service unavailable. Try refresh.'),
    );
  }, [address, account]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setHash(undefined);
    try {
      await action();
    } catch (e) {
      if (active.current)
        setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (active.current) {
        setBusy(false);
        void refresh().catch(() => {});
      }
    }
  }
  async function send(to: Address, data: Hex, value = 0n) {
    const { owner, wallet, client } = await context();
    const tx = await wallet.sendTransaction({
      account: owner,
      chain: sepolia,
      to,
      data,
      value,
    });
    if (active.current) {
      setHash(tx);
      setMessage('Waiting for Sepolia confirmation…');
    }
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== 'success') throw new Error('Transaction reverted.');
    await context();
    return receipt;
  }
  async function owned(a = account, tokenId = id) {
    const { owner, client } = await context();
    if (!a || tokenId === undefined) throw new Error('Load an account first.');
    const [current, registered] = await Promise.all([
      client.readContract({
        address: d.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      client.readContract({
        address: d.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'accountOf',
        args: [tokenId],
      }),
    ]);
    if (
      current.toLowerCase() !== owner.toLowerCase() ||
      registered.toLowerCase() !== a.toLowerCase()
    )
      throw new Error('This wallet does not own the registered account.');
    return { owner, client, a, tokenId };
  }
  async function setup() {
    const { client, owner, wallet } = await context();
    if (!validLabel(label))
      throw new Error(
        'Use 3–32 lowercase letters, numbers, or internal hyphens.',
      );
    const cap = usdc(budget);
    const [tokenId, predicted] = await client.readContract({
      address: d.registry,
      abi: kernelAccountFactoryAbi,
      functionName: 'nextAccountAddress',
    });
    setRecoverId(tokenId.toString());
    const calls = setupCalls(
      d.registry,
      d.token,
      label,
      tokenId,
      predicted,
      cap,
    );
    let atomic = false;
    try {
      atomic =
        (await getCapabilities(wallet, { account: owner, chainId: sepolia.id }))
          .atomic?.status === 'supported';
    } catch {
      /* Capability probing is read-only; use sequential setup when unavailable. */
    }
    await context();
    if (atomic) {
      setMessage(
        'Confirm account creation and the capped token approval together.',
      );
      const batch = await sendCalls(wallet, {
        account: owner,
        chain: sepolia,
        calls,
        forceAtomic: true,
      });
      setMessage(
        `Setup submitted. Batch ${batch.id}. If confirmation times out, load account #${tokenId} before retrying.`,
      );
      await waitForCallsStatus(wallet, {
        id: batch.id,
        throwOnFailure: true,
        timeout: 120_000,
      });
      await context();
    } else {
      setMessage(
        'Confirm account creation first. Token approval follows after verification.',
      );
      await send(calls[0].to, calls[0].data);
      await owned(predicted, tokenId);
      setAccount(predicted);
      setId(tokenId);
      setRecoverId(tokenId.toString());
      setMessage('Account created. Confirm its capped token approval.');
      await send(calls[1].to, calls[1].data);
    }
    await owned(predicted, tokenId);
    setAccount(predicted);
    setId(tokenId);
    setRecoverId(tokenId.toString());
    const approved = await client.readContract({
      address: d.token,
      abi: mockUSDCAbi,
      functionName: 'allowance',
      args: [owner, predicted],
    });
    if (approved !== cap)
      throw new Error(
        'Account created, but approval differs. Refresh and inspect before spending.',
      );
    setMessage(
      `Account #${tokenId} created; ${budget} demo USDC approved from your balance.`,
    );
    await refresh(predicted);
  }
  async function loadAccount() {
    if (!/^\d+$/.test(recoverId))
      throw new Error('Enter a numeric account ID.');
    const { client, wallet } = await context();
    const tokenId = BigInt(recoverId);
    const a = await client.readContract({
      address: d.registry,
      abi: kernelAccountFactoryAbi,
      functionName: 'accountOf',
      args: [tokenId],
    });
    if (/^0x0{40}$/i.test(a) || !(await client.getCode({ address: a })))
      throw new Error('No registered account found.');
    if (connector?.id === 'mandate-dev-wallet') {
      await wallet.request({
        method: 'mandate_registerAccount' as never,
        params: [{ account: a, tokenId: tokenId.toString() }] as never,
      });
    }
    setAccount(a);
    setId(tokenId);
    setMessage(
      `Account #${tokenId} loaded. Only its current owner can spend; any wallet can revoke its own allowance.`,
    );
  }
  async function pay() {
    const { client, owner, a, tokenId } = await owned();
    if (
      !isAddress(recipient) ||
      recipient.toLowerCase() === owner.toLowerCase() ||
      /^0x0{40}$/i.test(recipient)
    )
      throw new Error('Enter a different, nonzero recipient address.');
    const code = await client.getCode({ address: owner });
    if (code && code !== '0x')
      throw new Error(
        'EntryPoint 0.9 requires an undelegated EOA to submit this operation. This wallet needs a separate bundler, which is not configured yet.',
      );
    const value = usdc(amount);
    const fees = await client.estimateFeesPerGas();
    const maxFee = fees.maxFeePerGas * 2n;
    const [allowance, deposit, epoch] = await Promise.all([
      client.readContract({
        address: d.token,
        abi: mockUSDCAbi,
        functionName: 'allowance',
        args: [owner, a],
      }),
      client.readContract({
        address: d.entryPoint,
        abi: entryPointAbi,
        functionName: 'balanceOf',
        args: [a],
      }),
      client.readContract({
        address: d.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'ownershipEpoch',
        args: [tokenId],
      }),
    ]);
    if (value > allowance)
      throw new Error('Payment exceeds your remaining allowance.');
    if (deposit < maxFee * 660_000n)
      throw new Error('Top up the account gas deposit before submitting.');
    const op = {
      sender: a,
      nonce: await client.readContract({
        address: d.entryPoint,
        abi: entryPointAbi,
        functionName: 'getNonce',
        args: [a, 0n],
      }),
      initCode: '0x' as Hex,
      callData: ownerPayment(d.token, owner, recipient, value),
      accountGasLimits: packedPair(300_000n, 300_000n),
      preVerificationGas: 60_000n,
      gasFees: packedPair(fees.maxPriorityFeePerGas, maxFee),
      paymasterAndData: '0x' as Hex,
      signature: '0x' as Hex,
    };
    const actionHash = await client.readContract({
      address: d.entryPoint,
      abi: entryPointAbi,
      functionName: 'getUserOpHash',
      args: [op],
    });
    const c = await context();
    setMessage('Sign the payment authorization, then confirm its submission.');
    if (connector?.id === 'mandate-dev-wallet') {
      await c.wallet.request({
        method: 'mandate_prepareUserOperation' as never,
        params: [op] as never,
      });
    }
    op.signature = await c.wallet.signTypedData({
      account: owner,
      ...ownerAuthorization(
        sepolia.id,
        d.validator,
        a,
        tokenId,
        epoch,
        actionHash,
      ),
    });
    await owned();
    const before = await client.readContract({
      address: d.token,
      abi: mockUSDCAbi,
      functionName: 'balanceOf',
      args: [recipient],
    });
    await client.simulateContract({
      address: d.entryPoint,
      abi: entryPointAbi,
      functionName: 'handleOps',
      args: [[op], owner],
      account: owner,
    });
    const receipt = await send(
      d.entryPoint,
      encodeFunctionData({
        abi: entryPointAbi,
        functionName: 'handleOps',
        args: [[op], owner],
      }),
    );
    const events = receipt.logs
      .filter((l) => l.address.toLowerCase() === d.entryPoint.toLowerCase())
      .flatMap((log) => {
        try {
          const e = decodeEventLog({ abi: entryPointAbi, ...log });
          return e.eventName === 'UserOperationEvent' &&
            e.args.userOpHash === actionHash
            ? [e.args]
            : [];
        } catch {
          return [];
        }
      });
    if (!events[0]?.success)
      throw new Error(
        'Submission confirmed, but the payment failed inside the account. Gas was still charged.',
      );
    const after = await client.readContract({
      address: d.token,
      abi: mockUSDCAbi,
      functionName: 'balanceOf',
      args: [recipient],
      blockNumber: receipt.blockNumber,
    });
    setMessage(
      `Payment executed: ${amount} demo USDC. Recipient balance changed by ${formatUnits(after - before, 6)}; see transaction for exact transfers.`,
    );
  }
  if (compact)
    return (
      <section className="wallet-manager">
        {!address ? (
          <div className="wallet-empty-state">
            <span className="wallet-empty-icon" aria-hidden="true">
              <Wallet size={22} />
            </span>
            <div>
              <strong>Connect your wallet to see its agent wallets.</strong>
              <p>
                Verify ownership on the Spending page, then return here to
                review each wallet’s access.
              </p>
            </div>
            <a className="wallet-empty-action" href="/">
              Go to Spending <ArrowRight size={15} />
            </a>
          </div>
        ) : (
          <>
            {walletLoadError && (
              <div className="wallet-empty-state" role="alert">
                <span className="wallet-empty-icon" aria-hidden="true">
                  <Wallet size={22} />
                </span>
                <div>
                  <strong>Verify this wallet to load its access.</strong>
                  <p>{walletLoadError}</p>
                </div>
                <a className="wallet-empty-action" href="/">
                  Go to Spending <ArrowRight size={15} />
                </a>
              </div>
            )}
            {walletChoices.length > 0 ? (
              <div className="wallet-selection">
                <label htmlFor="spending-wallet">
                  Spending wallet
                  <WayleaveSelect id="spending-wallet" label="Spending wallet" value={recoverId}
                    onValueChange={value => {
                      setRecoverId(value);
                      setAccount(undefined);
                      setId(undefined);
                      setBalanceDetails(undefined);
                    }}
                    options={walletChoices.map(choice => ({ value: choice.id, label: choice.name }))} />
                </label>
                <button
                  className="secondary"
                  disabled={!ready || busy}
                  onClick={() => void run(loadAccount)}
                >
                  Open wallet
                </button>
              </div>
            ) : (
              !walletLoadError && (
                <div className="wallet-empty-state">
                  <span className="wallet-empty-icon" aria-hidden="true">
                    <Wallet size={22} />
                  </span>
                  <div>
                    <strong>No agent wallets yet.</strong>
                    <p>
                      Connect an agent to create its wallet and set a visible
                      spending boundary.
                    </p>
                  </div>
                  <a className="wallet-empty-action" href="/?setup=1">
                    Connect an agent <ArrowRight size={15} />
                  </a>
                </div>
              )
            )}
            {account && (
              <>
                <p className="wallet-address">
                  <a
                    href={`https://sepolia.etherscan.io/address/${account}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {account} ↗
                  </a>
                </p>
                <dl className="wallet-balances">
                  <div>
                    <dt>Your balance</dt>
                    <dd>
                      {balanceDetails?.token ?? '…'} <small>demo USDC</small>
                    </dd>
                  </div>
                  <div>
                    <dt>This wallet can access</dt>
                    <dd>
                      {balanceDetails?.allowance ?? '…'}{' '}
                      <small>demo USDC</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Reserved for network fees</dt>
                    <dd>
                      {balanceDetails?.gas ?? '…'} <small>Sepolia ETH</small>
                    </dd>
                  </div>
                </dl>
                <div className="wallet-control-actions">
                  <button
                    className="secondary"
                    disabled={!ready || busy}
                    onClick={() =>
                      void run(async () => {
                        await send(
                          d.token,
                          encodeFunctionData({
                            abi: mockUSDCAbi,
                            functionName: 'approve',
                            args: [account, 0n],
                          }),
                        );
                        setMessage('Spending access removed.');
                      })
                    }
                  >
                    Remove spending access
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await refresh();
                        setMessage('Balances refreshed.');
                      })
                    }
                  >
                    Refresh
                  </button>
                </div>
                <details className="wallet-allowance">
                  <summary>Change spending access</summary>
                  <p>
                    Set the total token amount this wallet can draw from your
                    balance. Each payment still requires your signature.
                  </p>
                  <label>
                    Maximum access · demo USDC
                    <input
                      value={budget}
                      onChange={(event) => setBudget(event.target.value)}
                    />
                  </label>
                  <button
                    className="secondary"
                    disabled={!ready || busy}
                    onClick={() =>
                      void run(async () => {
                        const { a } = await owned();
                        const cap = usdc(budget);
                        if (cap <= 0n)
                          throw new Error('Enter a positive amount.');
                        await send(
                          d.token,
                          encodeFunctionData({
                            abi: mockUSDCAbi,
                            functionName: 'approve',
                            args: [a, cap],
                          }),
                        );
                        setMessage('Spending access updated.');
                      })
                    }
                  >
                    Update access
                  </button>
                </details>
                <p className="footnote">
                  Token access remains until spent or removed, even if you
                  disconnect an agent.
                </p>
                <div role="status" className="transaction-message">
                  {busy
                    ? 'Waiting for your wallet and network confirmation…'
                    : message}
                  {hash && (
                    <p>
                      <a
                        href={`https://sepolia.etherscan.io/tx/${hash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View transaction ↗
                      </a>
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>
    );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>Spend from your balance</h3>
        <span>SEPOLIA</span>
      </div>
      <p className="footnote">
        Kernel v4 · NFT owner validator · EntryPoint 0.9. Demo tokens only.
        Payments currently require your signature; agent policies are not
        installed.
      </p>
      {!address && (
        <p className="account-connect-hint">
          <a href="/">Connect your wallet in My agents →</a>
        </p>
      )}
      {chainId !== sepolia.id && (
        <button
          className="secondary"
          onClick={() => switcher.mutate({ chainId: sepolia.id })}
          disabled={!address}
        >
          Switch to Sepolia
        </button>
      )}
      <fieldset
        disabled={!ready || busy}
        style={{ border: 0, padding: 0, minWidth: 0 }}
      >
        <div className="field-row">
          <label>
            Account label
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label>
            Allowance · demo USDC
            <input value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
        </div>
        <button className="primary" onClick={() => void run(setup)}>
          Create account + approve allowance
        </button>
        <div className="field-row">
          <label>
            Existing account ID
            <input
              value={recoverId}
              onChange={(e) => setRecoverId(e.target.value)}
            />
          </label>
          <button className="secondary" onClick={() => void run(loadAccount)}>
            Load account
          </button>
        </div>
        {account && (
          <p className="footnote" style={{ overflowWrap: 'anywhere' }}>
            Account #{id?.toString()}:{' '}
            <a
              href={`https://sepolia.etherscan.io/address/${account}`}
              target="_blank"
              rel="noreferrer"
            >
              {account}
            </a>
          </p>
        )}
        <p className="footnote">{balances}</p>
        <div className="field-row">
          <button
            className="secondary"
            onClick={() =>
              void run(async () => {
                const { owner } = await context();
                await send(
                  d.token,
                  encodeFunctionData({
                    abi: mockUSDCAbi,
                    functionName: 'mint',
                    args: [owner, 100_000_000n],
                  }),
                );
                setMessage('100 demo USDC minted to your wallet.');
              })
            }
          >
            Get 100 demo USDC
          </button>
          <button
            className="secondary"
            disabled={!account}
            onClick={() =>
              void run(async () => {
                const { a } = await owned();
                await send(
                  d.entryPoint,
                  encodeFunctionData({
                    abi: entryPointAbi,
                    functionName: 'depositTo',
                    args: [a],
                  }),
                  5_000_000_000_000_000n,
                );
                setMessage('Added 0.005 test ETH for account gas.');
              })
            }
          >
            Add 0.005 ETH for gas
          </button>
        </div>
        <div className="field-row">
          <label>
            Recipient
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x…"
            />
          </label>
          <label>
            Payment · demo USDC
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>
        <button
          className="primary"
          disabled={!account}
          onClick={() => void run(pay)}
        >
          Sign + send payment
        </button>
        <div className="field-row">
          <button
            className="secondary"
            disabled={!account}
            onClick={() =>
              void run(async () => {
                const { a } = await owned();
                const cap = usdc(budget);
                if (cap <= 0n) throw new Error('Enter a positive allowance.');
                await send(
                  d.token,
                  encodeFunctionData({
                    abi: mockUSDCAbi,
                    functionName: 'approve',
                    args: [a, cap],
                  }),
                );
                setMessage('Allowance updated.');
              })
            }
          >
            Set allowance
          </button>
          <button
            className="secondary"
            disabled={!account}
            onClick={() =>
              void run(async () => {
                if (!account) return;
                await send(
                  d.token,
                  encodeFunctionData({
                    abi: mockUSDCAbi,
                    functionName: 'approve',
                    args: [account, 0n],
                  }),
                );
                setMessage('Allowance revoked.');
              })
            }
          >
            Revoke allowance
          </button>
          <button
            className="secondary"
            onClick={() =>
              void run(async () => {
                await refresh();
                setMessage('Balances refreshed.');
              })
            }
          >
            Refresh
          </button>
        </div>
      </fieldset>
      <p className="footnote">
        The allowance caps total token exposure. It does not restrict recipients
        or expire when the NFT changes hands. Revoke it before handing over the
        account. Native ETH has no ERC-20 allowance.
      </p>
      <div
        role="status"
        className="transaction-message"
        style={{ overflowWrap: 'anywhere' }}
      >
        {message}
        {hash && (
          <p>
            <a
              href={`https://sepolia.etherscan.io/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
