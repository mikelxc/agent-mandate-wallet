'use client';
import { useEffect, useRef, useState } from 'react';
import {
  useAccount,
  useWalletClient,
  usePublicClient,
  useSwitchChain,
} from 'wagmi';
import { encodeFunctionData, formatUnits, type Address, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import {
  ownerAuthorization,
  ownerPayment,
  entryPointAbi,
  sepoliaDeployment as d,
} from '@mandate/sdk';
import type { AgentConnection, Operation } from '@mandate/protocol';
import type { Prepared } from '../../gateway/src/chain';

type Row = Operation & {
  execution?: {
    transactionHash: string;
    success: boolean;
    blockNumber: string;
  };
};
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/gateway${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error('Start the local gateway to use agent access.');
  }
  if (!response.ok)
    throw new Error((value as { error?: string }).error ?? 'Request failed');
  return value as T;
}
export function AgentControl() {
  const { address, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const client = usePublicClient({ chainId: sepolia.id });
  const switcher = useSwitchChain();
  const active = useRef(true);
  const [session, setSession] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    'Sign in to connect an agent and review its requests.',
  );
  const [agents, setAgents] = useState<AgentConnection[]>([]);
  const [operations, setOperations] = useState<Row[]>([]);
  const [name, setName] = useState('Research assistant');
  const [account, setAccount] = useState('');
  const [token, setToken] = useState('');
  const [selected, setSelected] = useState<string>();
  const [prepared, setPrepared] = useState<
    Prepared & { preparedUntil: number }
  >();
  const [recoveryHash, setRecoveryHash] = useState('');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    void api<{ address: string }>('/auth/session')
      .then((s) => {
        if (
          active.current &&
          s.address.toLowerCase() === address?.toLowerCase()
        )
          setSession(s.address);
      })
      .catch(() => {});
  }, [address]);
  async function refresh() {
    const [a, o] = await Promise.all([
      api<AgentConnection[]>('/agents'),
      api<Row[]>('/operations'),
    ]);
    if (active.current) {
      setAgents(a);
      setOperations(o);
    }
  }
  useEffect(() => {
    if (!session) return;
    void refresh().catch((e) => {
      setMessage(e.message);
      if (e.message === 'Sign in with your wallet') setSession('');
    });
    const timer = setInterval(() => void refresh().catch(() => {}), 8000);
    return () => clearInterval(timer);
  }, [session]);
  async function context() {
    if (
      !active.current ||
      !wallet ||
      !address ||
      !client ||
      (await wallet.getChainId()) !== sepolia.id
    )
      throw new Error('Connect your wallet on Sepolia.');
    if (wallet.account.address.toLowerCase() !== address.toLowerCase())
      throw new Error('Wallet changed.');
    return { wallet, address, client };
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (active.current) {
        setMessage(e instanceof Error ? e.message : 'Request failed');
        if (e instanceof Error && e.message === 'Sign in with your wallet')
          setSession('');
      }
    } finally {
      if (active.current) {
        setBusy(false);
        if (session) void refresh().catch(() => {});
      }
    }
  }
  async function login() {
    const c = await context();
    const challenge = await api<{ id: string; message: string }>(
      '/auth/challenge',
      { address: c.address },
    );
    const signature = await c.wallet.signMessage({
      account: c.address,
      message: challenge.message,
    });
    await context();
    const result = await api<{ address: string }>('/auth/verify', {
      id: challenge.id,
      signature,
    });
    if (active.current) {
      setSession(result.address);
      setMessage(
        'Signed in. Connecting an agent grants read and proposal access only.',
      );
    }
  }
  async function review(op: Row) {
    await context();
    const p = await api<Prepared & { preparedUntil: number }>(
      `/operations/${op.id}/prepare`,
      {},
    );
    if (active.current) {
      setSelected(op.id);
      setPrepared(p);
      setMessage('Review the exact payment below before signing.');
    }
  }
  async function signAndSend(op: Row) {
    const c = await context();
    const p = prepared;
    if (!p || selected !== op.id || p.preparedUntil <= Date.now() / 1000)
      throw new Error('Payment quote expired. Review again.');
    if (
      op.intent.fundingOwner !== c.address.toLowerCase() ||
      op.intent.token !== d.token.toLowerCase() ||
      p.entryPoint.toLowerCase() !== d.entryPoint.toLowerCase() ||
      p.validator.toLowerCase() !== d.validator.toLowerCase() ||
      p.op.sender.toLowerCase() !== op.intent.account
    )
      throw new Error('Payment scope changed.');
    if (
      p.op.callData !==
        ownerPayment(
          d.token,
          c.address,
          op.intent.recipient as Address,
          BigInt(op.intent.amount),
        ) ||
      p.op.initCode !== '0x' ||
      p.op.paymasterAndData !== '0x'
    )
      throw new Error('Prepared payment differs from the request.');
    const packed = {
      ...p.op,
      nonce: BigInt(p.op.nonce),
      preVerificationGas: BigInt(p.op.preVerificationGas),
    };
    const actionHash = await c.client.readContract({
      address: d.entryPoint,
      abi: entryPointAbi,
      functionName: 'getUserOpHash',
      args: [packed],
    });
    if (actionHash !== p.actionHash)
      throw new Error('Prepared payment hash mismatch.');
    const signature = await c.wallet.signTypedData({
      account: c.address,
      ...ownerAuthorization(
        sepolia.id,
        d.validator,
        op.intent.account as Address,
        BigInt(p.tokenId),
        BigInt(p.epoch),
        p.actionHash,
      ),
    });
    await context();
    await api(`/operations/${op.id}/approve`, { signature });
    setMessage(
      'Approval recorded. Confirm submission in your wallet. If you cancel now, this signed request remains approved.',
    );
    await context();
    const hash = await c.wallet.writeContract({
      chain: sepolia,
      account: c.address,
      address: d.entryPoint,
      abi: entryPointAbi,
      functionName: 'handleOps',
      args: [[{ ...packed, signature }], c.address],
    });
    setRecoveryHash(hash);
    setMessage(`Submitted ${hash}. Waiting for inclusion…`);
    await c.client.waitForTransactionReceipt({ hash });
    await context();
    const result = await api<Row>(`/operations/${op.id}/receipt`, {
      transactionHash: hash,
    });
    setPrepared(undefined);
    setSelected(undefined);
    setMessage(
      result.execution?.success
        ? 'Payment included on Sepolia. Service delivery has not been recorded.'
        : 'Transaction included, but the payment failed. Gas was charged.',
    );
  }
  async function resume(op: Row) {
    const c = await context();
    const recovered = await api<{ prepared: Prepared; signature: Hex }>(
      `/operations/${op.id}/authorization`,
      {},
    );
    const p = recovered.prepared;
    if (
      p.op.sender.toLowerCase() !== op.intent.account ||
      p.op.callData !==
        ownerPayment(
          d.token,
          c.address,
          op.intent.recipient as Address,
          BigInt(op.intent.amount),
        )
    )
      throw new Error('Recovered payload differs from the payment.');
    const packed = {
      ...p.op,
      nonce: BigInt(p.op.nonce),
      preVerificationGas: BigInt(p.op.preVerificationGas),
      signature: recovered.signature,
    };
    await context();
    const hash = await c.wallet.writeContract({
      chain: sepolia,
      account: c.address,
      address: d.entryPoint,
      abi: entryPointAbi,
      functionName: 'handleOps',
      args: [[packed], c.address],
    });
    setRecoveryHash(hash);
    setMessage(`Submitted ${hash}. Waiting for inclusion…`);
    await c.client.waitForTransactionReceipt({ hash });
    await context();
    const result = await api<Row>(`/operations/${op.id}/receipt`, {
      transactionHash: hash,
    });
    setMessage(
      result.execution?.success
        ? 'Payment included; delivery not recorded.'
        : 'Payment failed inside the account.',
    );
  }
  const signedIn = !!session && session === address?.toLowerCase();
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>Agent access & approvals</h3>
        <span>HUMAN APPROVAL</span>
      </div>
      <p className="footnote">
        Connect an agent to an existing account. Every payment still needs your
        signature. Requests and decisions persist when you close this page.
      </p>
      {!signedIn ? (
        <div className="field-row">
          {chainId !== sepolia.id ? (
            <button
              className="primary"
              disabled={!address || busy}
              onClick={() => switcher.mutate({ chainId: sepolia.id })}
            >
              Switch to Sepolia
            </button>
          ) : (
            <button
              className="primary"
              disabled={!address || busy}
              onClick={() => void run(login)}
            >
              Sign in with wallet
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="field-row">
            <label>
              Agent name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Kernel account address
              <input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="0x…"
              />
            </label>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await api<{
                  agent: AgentConnection;
                  token: string;
                }>('/agents', { name, account });
                setToken(result.token);
                setMessage(
                  'Connection created for 24 hours. Save its key now; it will not be shown again.',
                );
              })
            }
          >
            Create agent connection
          </button>
          {token && (
            <div className="transaction-message">
              <p>One-time connection key · read and propose only</p>
              <input
                aria-label="Agent connection key"
                type="password"
                readOnly
                value={token}
              />
              <div className="field-row">
                <button
                  className="secondary"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(token)
                      .then(() =>
                        setMessage(
                          'Connection key copied. Store it in the agent process environment.',
                        ),
                      )
                      .catch(() =>
                        setMessage(
                          'Clipboard unavailable. Select and copy the connection key.',
                        ),
                      )
                  }
                >
                  Copy key
                </button>
                <button className="secondary" onClick={() => setToken('')}>
                  Hide key
                </button>
              </div>
              <p className="footnote">
                Use MANDATE_AGENT_TOKEN with the local MCP adapter. The key
                cannot sign payments.
              </p>
            </div>
          )}
          <h3>Connected agents</h3>
          {!agents.length && (
            <p className="footnote">No agents connected yet.</p>
          )}
          {agents.map((a) => (
            <div className="receipt" key={a.id}>
              <div>
                <strong>{a.name}</strong>
                <p style={{ overflowWrap: 'anywhere' }}>{a.account}</p>
                <p>
                  {a.revokedAt
                    ? 'Revoked'
                    : a.expiresAt * 1000 <= Date.now()
                      ? 'Expired'
                      : `Expires ${new Date(a.expiresAt * 1000).toLocaleString()}`}
                </p>
              </div>
              <button
                className="secondary"
                disabled={busy || !!a.revokedAt}
                onClick={() =>
                  void run(async () => {
                    await api(`/agents/${a.id}/revoke`, {});
                    setMessage(
                      'Agent API access revoked. Existing signed payments and token allowances are unchanged.',
                    );
                  })
                }
              >
                Revoke access
              </button>
            </div>
          ))}
          <h3>Approval inbox & activity</h3>
          {!operations.length && (
            <p className="footnote">
              Requests from your connected agents will appear here.
            </p>
          )}
          {operations.map((op) => (
            <article
              className="transaction-message"
              key={op.id}
              id={`operation-${op.id}`}
              style={{ overflowWrap: 'anywhere' }}
            >
              <strong>{op.intent.businessReference}</strong>
              <p>
                {formatUnits(BigInt(op.intent.amount), 6)} demo USDC ·{' '}
                {agents.find((a) => a.id === op.agentId)?.name ?? 'Agent'}
              </p>
              <p>
                From {op.intent.fundingOwner}
                <br />
                To {op.intent.recipient}
                <br />
                Account {op.intent.account}
              </p>
              <p>
                {op.status === 'approval_required'
                  ? op.intent.expiresAt * 1000 <= Date.now()
                    ? 'Request expired'
                    : 'Your signature required'
                  : op.status === 'approved'
                    ? 'Signed approval recorded'
                    : 'Rejected'}
                {op.decisionReason ? ` · ${op.decisionReason}` : ''}
              </p>
              {op.execution ? (
                <p>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${op.execution.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {op.execution.success
                      ? 'Payment included'
                      : 'Payment failed'}{' '}
                    · block {op.execution.blockNumber} ↗
                  </a>
                  <br />
                  Inclusion evidence; finality and service delivery are not
                  tracked yet.
                </p>
              ) : op.status === 'approved' ? (
                <>
                  <p>
                    Submission is not yet recorded. Do not create a duplicate
                    request. If submitted, attach its transaction hash below.
                  </p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(() => resume(op))}
                  >
                    Resume signed submission
                  </button>
                  <label>
                    Transaction hash
                    <input
                      value={recoveryHash}
                      onChange={(e) => setRecoveryHash(e.target.value)}
                    />
                  </label>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(`/operations/${op.id}/receipt`, {
                          transactionHash: recoveryHash,
                        });
                        setMessage('Transaction evidence verified.');
                      })
                    }
                  >
                    Verify submitted transaction
                  </button>
                </>
              ) : null}
              {op.status === 'approval_required' && (
                <div className="field-row">
                  <button
                    className="secondary"
                    disabled={busy || op.intent.expiresAt * 1000 <= Date.now()}
                    onClick={() => void run(() => review(op))}
                  >
                    Review payment
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(`/operations/${op.id}/reject`, {
                          reason: 'Rejected by owner',
                        });
                        if (selected === op.id) {
                          setSelected(undefined);
                          setPrepared(undefined);
                        }
                        setMessage('Request rejected.');
                      })
                    }
                  >
                    Reject
                  </button>
                </div>
              )}
              {selected === op.id &&
                prepared &&
                op.status === 'approval_required' && (
                  <div>
                    <p>
                      Sepolia · exact payment above. Maximum account gas
                      reservation:{' '}
                      {formatUnits(
                        (BigInt(prepared.op.gasFees) & ((1n << 128n) - 1n)) *
                          660000n,
                        18,
                      )}{' '}
                      ETH. Submission also needs ETH in your connected wallet.
                    </p>
                    <p className="footnote">
                      Request approval expires at{' '}
                      {new Date(
                        prepared.preparedUntil * 1000,
                      ).toLocaleTimeString()}
                      . Once signed, this validator does not enforce that
                      deadline onchain.
                    </p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void run(() => signAndSend(op))}
                    >
                      Sign exact payment + submit
                    </button>
                  </div>
                )}
            </article>
          ))}
          <div className="field-row">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              Refresh requests
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api('/auth/logout', {});
                  setSession('');
                  setToken('');
                  setAgents([]);
                  setOperations([]);
                  setMessage('Signed out.');
                })
              }
            >
              Sign out
            </button>
          </div>
        </>
      )}
      <div
        role="status"
        className="transaction-message"
        style={{ overflowWrap: 'anywhere' }}
      >
        {message}
      </div>
    </section>
  );
}
