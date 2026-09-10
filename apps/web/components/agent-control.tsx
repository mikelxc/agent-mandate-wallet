'use client';
import { useEffect, useRef, useState } from 'react';
import {
  useConnect,
  useConnectors,
  useConnection,
  useWalletClient,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
} from 'wagmi';
import {
  formatUnits,
  isAddress,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clipboard,
  KeyRound,
  LockKeyhole,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  UserRound,
  X,
} from 'lucide-react';
import {
  ownerAuthorization,
  ownerPayment,
  entryPointAbi,
  kernelAccountFactoryAbi,
  nFTOwnerValidatorAbi,
  sepoliaDeployment as d,
  agentEnsName,
  ensV2RegistryAbi,
  ensV2HackathonDeployment,
  wayleaveSepoliaDeployment,
  validLabel,
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

type AgentHost = 'codex' | 'claude' | 'cursor';

const agentHosts: Array<{
  id: AgentHost;
  mark: string;
  name: string;
  detail: string;
}> = [
  { id: 'codex', mark: 'CX', name: 'Codex', detail: 'Desktop · CLI · IDE' },
  { id: 'claude', mark: 'CL', name: 'Claude', detail: 'Desktop · Code' },
  { id: 'cursor', mark: 'CR', name: 'Cursor', detail: 'Editor · Agent' },
];
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

function nowSeconds() {
  return Date.now() / 1000;
}

export function AgentControl() {
  const { address, chainId, connector: currentConnector } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const signMessage = useSignMessage();
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
  const [identityLabel, setIdentityLabel] = useState('my-agent');
  const [ensAvailability, setEnsAvailability] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'registered' | 'error'
  >('idle');
  const [nfatId, setNfatId] = useState<bigint>();
  const [account, setAccount] = useState('');
  const [token, setToken] = useState('');
  const [tokenHost, setTokenHost] = useState<AgentHost>();
  const [repositoryPath, setRepositoryPath] = useState('');
  const [selected, setSelected] = useState<string>();
  const [prepared, setPrepared] = useState<
    Prepared & { preparedUntil: number }
  >();
  const [recoveryHash, setRecoveryHash] = useState('');
  const [renderTime, setRenderTime] = useState(() => Date.now());
  const [mobileStep, setMobileStep] = useState(1);
  const [mobilePro, setMobilePro] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [identityProof, setIdentityProof] = useState('');
  const [creationHash, setCreationHash] = useState<Hex>();
  const [uiReady, setUiReady] = useState(false);
  useEffect(() => {
    try {
      setMobilePro(
        localStorage.getItem('wayleave.walkthrough.dismissed') === 'true',
      );
    } catch {
      /* Storage is optional. */
    }
    setUiReady(true);
  }, []);
  function showDashboard(show: boolean) {
    setMobilePro(show);
    try {
      localStorage.setItem('wayleave.walkthrough.dismissed', String(show));
    } catch {
      /* Storage is optional. */
    }
  }
  const walkthroughOrder = [1, 6, 2, 0, 3, 4, 5];
  const [agentHost, setAgentHost] = useState<AgentHost>('codex');
  const [authStage, setAuthStage] = useState<
    'idle' | 'connecting' | 'network' | 'signing' | 'verifying'
  >('idle');
  useEffect(() => {
    active.current = true;
    const timer = setInterval(() => setRenderTime(Date.now()), 30_000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setSession('');
    void api<{ address: string; chainId: number }>('/auth/session')
      .then((s) => {
        if (
          !cancelled &&
          active.current &&
          s.chainId === sepolia.id &&
          s.address.toLowerCase() === address?.toLowerCase()
        ) {
          // Native WalletConnect can authenticate before wagmi publishes the account.
          // Recover the verified state here if its earlier sign-in event was missed.
          setSession(s.address.toLowerCase());
          setMessage(
            'Owner verified. Your agent can only read and propose until you approve an exact action.',
          );
          setMobileStep((step) => (step === 1 ? 6 : step));
        }
      })
      .catch(() => {});
    function sessionChanged(event: Event) {
      const signedIn = (
        event as CustomEvent<{ address: string; chainId: number } | null>
      ).detail;
      if (!signedIn) {
        setSession('');
        return;
      }
      if (
        signedIn.chainId === sepolia.id &&
        signedIn.address.toLowerCase() === address?.toLowerCase()
      ) {
        setSession(signedIn.address.toLowerCase());
        setMessage(
          'Owner verified. Your agent can only read and propose until you approve an exact action.',
        );
        setMobileStep(6);
      }
    }
    window.addEventListener('wayleave:owner-session', sessionChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('wayleave:owner-session', sessionChanged);
    };
  }, [address]);
  useEffect(() => {
    if (!client || !validLabel(identityLabel)) {
      setEnsAvailability('idle');
      return;
    }
    let cancelled = false;
    setEnsAvailability('checking');
    const timer = setTimeout(() => {
      void client
        .readContract({
          address: wayleaveSepoliaDeployment.userRegistry,
          abi: ensV2RegistryAbi,
          functionName: 'getStatus',
          args: [BigInt(keccak256(toHex(identityLabel)))],
        })
        .then((status) => {
          if (!cancelled)
            setEnsAvailability(status === 0 ? 'available' : 'taken');
        })
        .catch(() => {
          if (!cancelled) setEnsAvailability('error');
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, identityLabel]);
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
    let owner = address;
    let connectedChain = chainId;
    try {
      const connector = connectors.find(
        (item) => item.id === 'mandate-dev-wallet',
      );
      if (
        !connector ||
        (owner && currentConnector?.id !== 'mandate-dev-wallet')
      ) {
        // AppKit continues from connection into SIWE signing and backend verification.
        // Check service availability before asking the owner to open their wallet.
        await api('/health');
        const { openWalletPicker, verifyConnectedOwner } =
          await import('../lib/wallet-config');
        if (!owner) {
          setMessage(
            'Connect your wallet and approve the sign-in request to verify ownership.',
          );
          await openWalletPicker();
        } else {
          if (connectedChain !== sepolia.id) {
            setAuthStage('network');
            await switcher.mutateAsync({ chainId: sepolia.id });
          }
          setAuthStage('signing');
          await verifyConnectedOwner();
        }
        return;
      }
      if (!owner) {
        setAuthStage('connecting');
        setMessage('Choose an account in your wallet…');
        const connection = await connect
          .mutateAsync({ connector })
          .catch(() => {
            throw new Error(
              'Wallet connection was not completed. Open this preview in a wallet-enabled browser and try again.',
            );
          });
        owner = connection.accounts[0];
        connectedChain = connection.chainId;
      }
      if (!owner) throw new Error('The wallet did not return an account.');
      await api('/health');
      if (connectedChain !== sepolia.id) {
        setAuthStage('network');
        setMessage('Switching the wallet to Sepolia…');
        await switcher.mutateAsync({ chainId: sepolia.id }).catch(() => {
          throw new Error(
            'Network switch was canceled. Select Sepolia and try again.',
          );
        });
      }
      setAuthStage('signing');
      setMessage(
        'Sign the ownership message in your wallet. No funds can move.',
      );
      const challenge = await api<{ id: string; message: string }>(
        '/auth/challenge',
        { address: owner },
      );
      const signature = await signMessage
        .mutateAsync({
          account: owner,
          message: challenge.message,
        })
        .catch(() => {
          throw new Error(
            'Ownership verification was canceled. No permissions were granted.',
          );
        });
      setAuthStage('verifying');
      setMessage('Verifying the wallet signature…');
      const result = await api<{ address: string }>('/auth/verify', {
        id: challenge.id,
        signature,
      });
      if (active.current) {
        setSession(result.address);
        setMessage(
          'Owner verified. Your agent can only read and propose until you approve an exact action.',
        );
        setMobileStep(6);
      }
    } finally {
      if (active.current) setAuthStage('idle');
    }
  }
  async function createNfat() {
    const c = await context();
    if (!validLabel(identityLabel))
      throw new Error(
        'Use 3–32 lowercase letters, numbers, or internal hyphens.',
      );
    const status = await c.client.readContract({
      address: wayleaveSepoliaDeployment.userRegistry,
      abi: ensV2RegistryAbi,
      functionName: 'getStatus',
      args: [BigInt(keccak256(toHex(identityLabel)))],
    });
    if (status !== 0)
      throw new Error(
        `${agentEnsName(identityLabel)} is already taken. Choose another name.`,
      );
    const [tokenId, predicted] = await c.client.readContract({
      address: d.registry,
      abi: kernelAccountFactoryAbi,
      functionName: 'nextAccountAddress',
    });
    setMessage(
      `Confirm creation of ${agentEnsName(identityLabel)}. This mints the NFAT and its account; it does not approve token spending.`,
    );
    const hash = await c.wallet.writeContract({
      chain: sepolia,
      account: c.address,
      address: d.registry,
      abi: kernelAccountFactoryAbi,
      functionName: 'createAccountChecked',
      args: [identityLabel, tokenId],
    });
    const receipt = await c.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success')
      throw new Error('NFAT creation reverted. No account was created.');
    const [owner, registered, resolved] = await Promise.all([
      c.client.readContract({
        address: d.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'ownerOf',
        args: [tokenId],
      }),
      c.client.readContract({
        address: d.registry,
        abi: kernelAccountFactoryAbi,
        functionName: 'accountOf',
        args: [tokenId],
      }),
      c.client.getEnsAddress({ name: agentEnsName(identityLabel) }),
    ]);
    if (
      owner.toLowerCase() !== c.address.toLowerCase() ||
      registered.toLowerCase() !== predicted.toLowerCase() ||
      resolved?.toLowerCase() !== predicted.toLowerCase()
    )
      throw new Error('Created NFAT did not match its live Wayleave name.');
    if (active.current) {
      setCreationHash(hash);
      setAccount(predicted);
      setNfatId(tokenId);
      setEnsAvailability('registered');
      setMessage(
        `NFAT #${tokenId} created. ${agentEnsName(identityLabel)} now resolves to ${predicted}.`,
      );
      setMobileStep(0);
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
    if (!p || selected !== op.id || p.preparedUntil <= nowSeconds())
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
  const activeAgents = agents.filter(
    (item) => !item.revokedAt && item.expiresAt * 1000 > renderTime,
  );
  const selectedAccount =
    account || activeAgents[0]?.account || agents[0]?.account || '';
  const hasAccount = isAddress(selectedAccount);
  useEffect(() => {
    setIdentityProof('');
  }, [address, selectedAccount]);
  const setupSteps = [
    true,
    signedIn,
    hasAccount,
    activeAgents.length > 0,
    operations.length > 0,
  ];
  const setupCount = setupSteps.filter(Boolean).length;
  const authLabel =
    authStage === 'connecting'
      ? 'Connecting wallet…'
      : authStage === 'network'
        ? 'Switching network…'
        : authStage === 'signing'
          ? 'Check your wallet…'
          : authStage === 'verifying'
            ? 'Verifying signature…'
            : !address
              ? 'Connect & verify owner'
              : chainId !== sepolia.id
                ? 'Switch & verify owner'
                : 'Verify ownership';
  const selectedHost = agentHosts.find((host) => host.id === agentHost)!;
  const hasCurrentCredential = !!token && tokenHost === agentHost;
  const credential = hasCurrentCredential
    ? token
    : `<create-a-${agentHost}-connection>`;
  const checkoutPath =
    repositoryPath.trim() || '<absolute-path-to-agent-mandate-wallet>';
  const checkoutPathIsAbsolute =
    checkoutPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(checkoutPath);
  const agentGateway =
    uiReady && !['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? 'https://way-leave.vercel.app/gateway'
      : 'http://127.0.0.1:3001';
  const jsonServer = JSON.stringify(
    {
      mcpServers: {
        wayleave: {
          command: 'bun',
          args: ['run', '--cwd', checkoutPath, 'agent:mcp'],
          env: {
            WAYLEAVE_AGENT_TOKEN: credential,
            WAYLEAVE_GATEWAY_URL: agentGateway,
          },
        },
      },
    },
    null,
    2,
  );
  const mcpConfig =
    agentHost === 'codex'
      ? `[mcp_servers.wayleave]
command = "bun"
args = ["run", "--cwd", ${JSON.stringify(checkoutPath)}, "agent:mcp"]

[mcp_servers.wayleave.env]
WAYLEAVE_AGENT_TOKEN = "${credential}"
WAYLEAVE_GATEWAY_URL = "${agentGateway}"`
      : jsonServer;
  const mcpDestination =
    agentHost === 'codex'
      ? 'Add to .codex/config.toml or Settings → MCP servers'
      : agentHost === 'cursor'
        ? 'Save as .cursor/mcp.json in your project'
        : 'Add to claude_desktop_config.json';
  const identityName = agentEnsName(identityLabel);
  return (
    <>
      <section
        className={`mobile-agent-onboarding ${mobilePro || !uiReady ? 'hidden' : ''}`}
      >
        <div className="mobile-grid-glow" aria-hidden="true" />
        <div className="mobile-onboarding-top">
          <span className="mobile-wordmark">
            <ShieldCheck size={15} /> WAYLEAVE
          </span>
          <button onClick={() => showDashboard(true)}>Skip setup</button>
        </div>

        <div className="mobile-stage">
          <div className="mobile-step-meta">
            <span>0{walkthroughOrder.indexOf(mobileStep) + 1}</span>
            <i />
            <small>07</small>
          </div>

          {mobileStep === 0 && (
            <div className="mobile-step-content host-step">
              <div className="agent-orbit" aria-hidden="true">
                <span className="orbit-ring ring-one" />
                <span className="orbit-ring ring-two" />
                <span className="orbit-tracer" />
                <span className="orbit-core">
                  <Bot size={30} />
                </span>
                <span className="orbit-chip chip-you">OWNER</span>
                <span className="orbit-chip chip-agent">MCP</span>
              </div>
              <div className="mobile-copy">
                <span className="mobile-kicker">CHOOSE CLIENT / 04</span>
                <h2>Where does your agent work?</h2>
                <p>
                  Now that the NFAT exists, choose the first client to connect.
                  You can return at step 6 to add another client with its own
                  revocable key.
                </p>
              </div>
              <div className="agent-host-picker" aria-label="Agent host">
                {agentHosts.map((host) => (
                  <button
                    key={host.id}
                    type="button"
                    aria-pressed={agentHost === host.id}
                    className={agentHost === host.id ? 'selected' : ''}
                    onClick={() => setAgentHost(host.id)}
                  >
                    <span>{host.mark}</span>
                    <strong>{host.name}</strong>
                    <small>{host.detail}</small>
                    {agentHost === host.id && <Check size={14} />}
                  </button>
                ))}
              </div>
              <button
                className="mobile-primary"
                onClick={() => setMobileStep(3)}
              >
                Continue with {selectedHost.name} <ArrowRight size={17} />
              </button>
              <p className="mobile-trust">
                <PlugZap size={14} /> One MCP connection · three scoped tools
              </p>
            </div>
          )}

          {mobileStep === 1 && (
            <div className="mobile-step-content">
              <div className="boundary-visual" aria-hidden="true">
                <div className="boundary-core">
                  <UserRound size={25} />
                </div>
                <span className="boundary-ray ray-one" />
                <span className="boundary-ray ray-two" />
                <span className="boundary-ray ray-three" />
              </div>
              <div className="mobile-copy">
                <span className="mobile-kicker">CONNECT WALLET / 01</span>
                <h2>Prove it’s yours.</h2>
                <p>
                  Connect your wallet and sign a login message. This verifies
                  ownership—it cannot move funds or grant agent access.
                </p>
              </div>
              {!signedIn ? (
                <button
                  className="mobile-primary"
                  disabled={busy || authStage !== 'idle'}
                  onClick={() => void run(login)}
                >
                  {authStage !== 'idle' && (
                    <RefreshCw className="spin" size={16} />
                  )}
                  <span>{authLabel}</span>
                  <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  className="mobile-primary"
                  onClick={() => setMobileStep(6)}
                >
                  Owner verified <Check size={17} />
                </button>
              )}
              <p className="mobile-trust">
                <LockKeyhole size={14} /> No transaction · no token approval
              </p>
            </div>
          )}

          {mobileStep === 6 && (
            <div className="mobile-step-content">
              <div className="mobile-copy">
                <span className="mobile-kicker">AUTHORITY / 02</span>
                <h2>You approve every payment.</h2>
                <p>
                  Your first policy is approval-only. MCP can read this account
                  and propose a payment. It receives no signing key. Each
                  payment requires your signature over its exact details.
                </p>
              </div>
              <div className="mobile-permissions">
                <span>
                  <Check size={14} /> Read account
                </span>
                <span>
                  <Check size={14} /> Propose payment
                </span>
                <span className="off">
                  <X size={14} /> Spend without approval
                </span>
              </div>
              <p className="mobile-trust">
                A token allowance is separate. Creating the account grants no
                allowance. You can set or revoke a capped allowance in account
                settings.
              </p>
              <button
                className="mobile-primary"
                onClick={() => {
                  setPolicyAccepted(true);
                  setMobileStep(2);
                }}
              >
                Use approval-only policy <ArrowRight size={17} />
              </button>
              <p className="mobile-trust">
                This selects the existing owner-signature flow; it does not
                install an autonomous policy module.
              </p>
            </div>
          )}

          {mobileStep === 5 && (
            <div className="mobile-step-content">
              <div className="mobile-copy">
                <span className="mobile-kicker">INTEROPERABILITY / 07</span>
                <h2>One account. Any client.</h2>
                <p>
                  The NFAT identifies the same onchain account from your
                  dashboard or an MCP client. Changing clients does not create a
                  new wallet or move your funds.
                </p>
              </div>
              <div className="mobile-config-preview">
                <div>
                  <span>Sepolia · NFAT registry</span>
                </div>
                <pre>
                  {d.registry}
                  {'\n'}Account:{' '}
                  {selectedAccount || 'Create or select an account first'}
                  {nfatId !== undefined ? `\nNFAT #${nfatId}` : ''}
                </pre>
              </div>
              {creationHash && (
                <a
                  className="mobile-link"
                  href={`https://sepolia.etherscan.io/tx/${creationHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View account creation receipt
                </a>
              )}
              <button
                className="mobile-primary"
                disabled={busy || !signedIn || !hasAccount}
                onClick={() =>
                  void run(async () => {
                    const c = await context();
                    const [registry, foundId] = await c.client.readContract({
                      address: d.validator,
                      abi: nFTOwnerValidatorAbi,
                      functionName: 'bindings',
                      args: [selectedAccount as Address],
                    });
                    if (registry.toLowerCase() !== d.registry.toLowerCase())
                      throw new Error('Account is outside this registry.');
                    const [registered, owner] = await Promise.all([
                      c.client.readContract({
                        address: d.registry,
                        abi: kernelAccountFactoryAbi,
                        functionName: 'accountOf',
                        args: [foundId],
                      }),
                      c.client.readContract({
                        address: d.registry,
                        abi: kernelAccountFactoryAbi,
                        functionName: 'ownerOf',
                        args: [foundId],
                      }),
                    ]);
                    if (
                      registered.toLowerCase() !==
                        selectedAccount.toLowerCase() ||
                      owner.toLowerCase() !== c.address.toLowerCase()
                    )
                      throw new Error(
                        'The account or NFT owner no longer matches.',
                      );
                    await context();
                    setIdentityProof(
                      `Verified on Sepolia: NFAT #${foundId} maps to ${registered}. Your connected wallet owns the NFT.`,
                    );
                  })
                }
              >
                Verify NFT → account <ArrowRight size={17} />
              </button>
              {identityProof && (
                <p className="mobile-trust" role="status">
                  {identityProof}
                </p>
              )}
              <p className="mobile-trust">
                In your MCP client, call get_account and compare its account
                address with this one. A configuration file alone does not prove
                the client is connected. Give each additional client its own
                revocable connection.
              </p>
              <button className="mobile-link" onClick={() => setMobileStep(4)}>
                View MCP configuration
              </button>
              <button
                className="mobile-primary"
                onClick={() => showDashboard(true)}
              >
                Open my dashboard <ArrowRight size={17} />
              </button>
            </div>
          )}

          {mobileStep === 2 && (
            <div className="mobile-step-content nfat-step">
              <div className="nfat-card" aria-hidden="true">
                <div className="nfat-card-top">
                  <span>NFAT</span>
                  <small>ERC-721 · SEPOLIA</small>
                </div>
                <div className="nfat-glyph">
                  <ShieldCheck size={28} />
                </div>
                <strong>{identityName}</strong>
                <small>OWNER CONTROLLED ACCOUNT</small>
              </div>
              <div className="mobile-copy">
                <span className="mobile-kicker">FIRST TRANSACTION / 03</span>
                <h2>Give the account a name.</h2>
                <p>
                  Your first real test transaction creates an NFAT and registers
                  its ENS name together. Sepolia gas only; no invented name fee.
                  The NFT identifies the account and its owner controls it.
                </p>
              </div>
              <label className="mobile-field nfat-name-field">
                Account name
                <span>
                  <input
                    value={identityLabel}
                    onChange={(event) => setIdentityLabel(event.target.value)}
                    aria-describedby="ens-preview-note"
                  />
                  <b>.{ensV2HackathonDeployment.parentName}</b>
                </span>
              </label>
              <p className="ens-preview-note" id="ens-preview-note">
                {ensAvailability === 'checking'
                  ? 'Checking ENSv2 availability…'
                  : ensAvailability === 'taken'
                    ? 'Already registered on ENSv2 · choose another name'
                    : ensAvailability === 'registered'
                      ? 'Live on hackathon ENSv2 · resolves to this account'
                      : ensAvailability === 'available'
                        ? 'Available on ENSv2 · registered atomically with the NFAT'
                        : ensAvailability === 'error'
                          ? 'ENSv2 check unavailable · verified again before minting'
                          : 'Live hackathon ENSv2 name · registered with the NFAT'}
              </p>
              {isAddress(account) && nfatId !== undefined ? (
                <button
                  className="mobile-primary"
                  onClick={() => setMobileStep(0)}
                >
                  NFAT #{nfatId.toString()} created <Check size={17} />
                </button>
              ) : (
                <button
                  className="mobile-primary"
                  disabled={
                    busy ||
                    !signedIn ||
                    !policyAccepted ||
                    !validLabel(identityLabel) ||
                    ensAvailability === 'checking' ||
                    ensAvailability === 'taken'
                  }
                  onClick={() => void run(createNfat)}
                >
                  Create named account <ArrowRight size={17} />
                </button>
              )}
              <p className="mobile-trust">
                <LockKeyhole size={14} /> No token approval · no agent access
                yet
              </p>
            </div>
          )}

          {mobileStep === 3 && (
            <div className="mobile-step-content">
              <div className="connection-signal" aria-hidden="true">
                <span>
                  <ShieldCheck size={25} />
                </span>
                <i>
                  <b />
                </i>
                <span>
                  <Bot size={21} />
                </span>
              </div>
              <div className="mobile-copy">
                <span className="mobile-kicker">SELECT ACCOUNT / 05</span>
                <h2>Select the NFAT.</h2>
                <p>
                  This is the account each client can read from and propose
                  payments for. Clients never receive its signing authority.
                </p>
              </div>
              <button
                type="button"
                className="nfat-selector selected"
                aria-pressed="true"
              >
                <span>NF</span>
                <div>
                  <strong>{identityName}</strong>
                  <small>
                    NFAT {nfatId === undefined ? 'account' : `#${nfatId}`}
                  </small>
                </div>
                <Check size={15} />
              </button>
              <button
                className="mobile-primary"
                disabled={!isAddress(selectedAccount)}
                onClick={() => setMobileStep(4)}
              >
                Configure MCP clients <ArrowRight size={17} />
              </button>
              <div className="mobile-permissions">
                <span>
                  <Check size={14} /> Read account
                </span>
                <span>
                  <Check size={14} /> Propose payment
                </span>
                <span className="off">
                  <X size={14} /> Sign transaction
                </span>
              </div>
              {!isAddress(selectedAccount) && (
                <button
                  className="mobile-link"
                  onClick={() => setMobileStep(2)}
                >
                  Create the NFAT first
                </button>
              )}
            </div>
          )}

          {mobileStep === 4 && (
            <div className="mobile-step-content">
              <div className="mcp-host-badge" aria-hidden="true">
                <span>{selectedHost.mark}</span>
                <div>
                  <small>READY FOR</small>
                  <strong>{selectedHost.name}</strong>
                </div>
                <i />
              </div>
              <div className="mobile-copy">
                <span className="mobile-kicker">LINK MCP / 06</span>
                <h2>Bring the lane into {selectedHost.name}.</h2>
                <p>
                  Choose a client, create a separate 24-hour key for it, and
                  copy a setup tied to this NFAT.
                </p>
              </div>
              <div className="agent-host-picker" aria-label="Agent host">
                {agentHosts.map((host) => (
                  <button
                    key={host.id}
                    type="button"
                    aria-pressed={agentHost === host.id}
                    className={agentHost === host.id ? 'selected' : ''}
                    onClick={() => setAgentHost(host.id)}
                  >
                    <span>{host.mark}</span>
                    <strong>{host.name}</strong>
                    <small>{host.detail}</small>
                    {agentHost === host.id && <Check size={14} />}
                  </button>
                ))}
              </div>
              <label className="mobile-field">
                Connection name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button
                className="mobile-primary"
                disabled={busy || !signedIn || !isAddress(selectedAccount)}
                onClick={() =>
                  void run(async () => {
                    const result = await api<{
                      agent: AgentConnection;
                      token: string;
                    }>('/agents', { name, account: selectedAccount });
                    setToken(result.token);
                    setTokenHost(agentHost);
                    setMessage(
                      `${selectedHost.name} connection created. Copy its setup now; create another connection for each additional client.`,
                    );
                  })
                }
              >
                <PlugZap size={16} />{' '}
                {hasCurrentCredential
                  ? `Create another ${selectedHost.name} key`
                  : `Create ${selectedHost.name} connection`}
              </button>
              {!hasCurrentCredential && (
                <p className="mobile-trust">
                  Existing keys cannot be retrieved. Create a separate
                  connection for every client you add.
                </p>
              )}
              <label className="mobile-field">
                Wayleave checkout path
                <input
                  value={repositoryPath}
                  onChange={(event) => setRepositoryPath(event.target.value)}
                  placeholder="/absolute/path/to/agent-mandate-wallet"
                  spellCheck="false"
                />
              </label>
              <div className="mobile-mcp-recipe">
                <div>
                  <small>01</small>
                  <span>Use a local checkout</span>
                  <code>github.com/mikelxc/agent-mandate-wallet</code>
                </div>
                <div>
                  <small>02</small>
                  <span>Add configuration</span>
                  <code>
                    {agentHost === 'codex' ? 'config.toml' : 'mcp.json'}
                  </code>
                </div>
                <div>
                  <small>03</small>
                  <span>Test the lane</span>
                  <code>get_account</code>
                </div>
              </div>
              <div
                className="mobile-config-preview"
                aria-label={`${selectedHost.name} MCP configuration`}
              >
                <div>
                  <span>
                    {agentHost === 'codex' ? 'config.toml' : 'mcp.json'}
                  </span>
                  <small>WAYLEAVE / STDIO</small>
                </div>
                <pre>{mcpConfig}</pre>
              </div>
              <button
                className="mobile-primary"
                disabled={!hasCurrentCredential || !checkoutPathIsAbsolute}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(mcpConfig)
                    .then(() => setMessage('MCP configuration copied.'))
                    .catch(() =>
                      setMessage('Select and copy the MCP configuration.'),
                    )
                }
              >
                <Clipboard size={16} /> Copy {selectedHost.name} setup
              </button>
              <p className="mobile-trust">
                {mcpDestination}.{' '}
                {agentGateway.startsWith('http://127.0.0.1')
                  ? 'Keep bun run gateway running locally.'
                  : 'This setup uses the hosted Wayleave gateway.'}
              </p>
              <button className="mobile-link" onClick={() => setMobileStep(5)}>
                Explore your account identity
              </button>
            </div>
          )}
        </div>

        <div className="mobile-step-nav" aria-label="Onboarding steps">
          {walkthroughOrder.map((step, index) => (
            <button
              key={step}
              className={mobileStep === step ? 'active' : ''}
              aria-label={`Go to step ${index + 1}`}
              onClick={() => setMobileStep(step)}
            />
          ))}
        </div>
        <output className="mobile-status">{message}</output>
      </section>

      <div
        className={`agent-shell desktop-agent-pro ${mobilePro && uiReady ? 'show-on-mobile' : ''}`}
      >
        <button className="mobile-return" onClick={() => showDashboard(false)}>
          Open walkthrough
        </button>
        <section className="agent-overview panel">
          <div className="overview-copy">
            <span className="status">
              <ShieldCheck size={13} /> Human approval required
            </span>
            <h2>Your accounts & requests.</h2>
            <p>
              Review your connected agents and real payment requests. Every
              payment needs your exact signature.
            </p>
          </div>
          <div
            className="agent-flow"
            aria-label="Owner to Mandate to agent permission flow"
          >
            <div className="flow-node">
              <span>
                <UserRound size={18} />
              </span>
              <strong>You</strong>
              <small>hold the keys</small>
            </div>
            <div className="flow-rail">
              <i />
            </div>
            <div className="flow-node mandate-node">
              <span>
                <ShieldCheck size={18} />
              </span>
              <strong>Mandate</strong>
              <small>checks scope</small>
            </div>
            <div className="flow-rail reverse">
              <i />
            </div>
            <div className="flow-node">
              <span>
                <Bot size={18} />
              </span>
              <strong>Agent</strong>
              <small>proposes only</small>
            </div>
          </div>
        </section>

        <div className="agent-grid">
          <section className="panel setup-panel">
            <div className="setup-head">
              <div>
                <div className="eyebrow">GET STARTED</div>
                <h2>Connect your first agent</h2>
              </div>
              <strong>{setupCount} / 5</strong>
            </div>
            <div
              className="progress-track"
              aria-label={`${setupCount} of 5 setup steps complete`}
            >
              <span style={{ width: `${setupCount * 20}%` }} />
            </div>

            <div className="setup-step complete">
              <span className="step-icon">
                <Check size={15} />
              </span>
              <div>
                <strong>Approval-only policy</strong>
                <p>Clients can read and propose. Only the owner can sign.</p>
              </div>
            </div>

            <div className={`setup-step ${signedIn ? 'complete' : 'current'}`}>
              <span className="step-icon">
                {signedIn ? <Check size={15} /> : <span>2</span>}
              </span>
              <div>
                <strong>Verify the owner</strong>
                <p>
                  Connect on Sepolia and sign a login message. This grants no
                  spending authority.
                </p>
                {!signedIn && (
                  <div className="step-action">
                    <button
                      className="primary"
                      disabled={busy || authStage !== 'idle'}
                      onClick={() => void run(login)}
                    >
                      {authStage !== 'idle' && (
                        <RefreshCw className="spin" size={14} />
                      )}
                      {authLabel} <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`setup-step ${hasAccount ? 'complete' : signedIn ? 'current' : ''}`}
            >
              <span className="step-icon">
                {hasAccount ? <Check size={15} /> : <span>3</span>}
              </span>
              <div>
                <strong>Create the NFAT account</strong>
                <p>
                  Mint the owner-controlled NFT first. Its readable identity is
                  used everywhere else in the setup.
                </p>
                {signedIn && (
                  <div className="connection-form nfat-create-form">
                    <label className="desktop-name-field">
                      Account name
                      <span>
                        <input
                          value={identityLabel}
                          onChange={(e) => setIdentityLabel(e.target.value)}
                        />
                        <b>.{ensV2HackathonDeployment.parentName}</b>
                      </span>
                    </label>
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        hasAccount ||
                        !validLabel(identityLabel) ||
                        ensAvailability === 'checking' ||
                        ensAvailability === 'taken'
                      }
                      onClick={() => void run(createNfat)}
                    >
                      {hasAccount ? (
                        <Check size={14} />
                      ) : (
                        <KeyRound size={14} />
                      )}
                      {hasAccount ? 'NFAT created' : 'Mint NFAT'}
                    </button>
                    <p className="ens-rollout-note">
                      {ensAvailability === 'taken'
                        ? 'That Wayleave name is already registered. Choose another.'
                        : ensAvailability === 'checking'
                          ? 'Checking the live Wayleave registry…'
                          : 'The NFAT, smart account, and Wayleave ENSv2 subname are created together.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`setup-step ${activeAgents.length ? 'complete' : signedIn && hasAccount ? 'current' : ''}`}
            >
              <span className="step-icon">
                {activeAgents.length ? <Check size={15} /> : <span>4</span>}
              </span>
              <div>
                <strong>Choose an MCP client and grant access</strong>
                <p>
                  Create a separate revocable 24-hour key for every client you
                  connect to this NFAT.
                </p>
                {signedIn && hasAccount && (
                  <div className="connection-form">
                    <div
                      className="desktop-host-picker"
                      aria-label="Agent host"
                    >
                      {agentHosts.map((host) => (
                        <button
                          key={host.id}
                          type="button"
                          aria-pressed={agentHost === host.id}
                          className={agentHost === host.id ? 'selected' : ''}
                          onClick={() => setAgentHost(host.id)}
                        >
                          <span>{host.mark}</span>
                          {host.name}
                        </button>
                      ))}
                    </div>
                    <label>
                      Connection name
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <div className="desktop-nfat-selected">
                      <span>NF</span>
                      <div>
                        <strong>{identityName}</strong>
                        <small>
                          {nfatId === undefined
                            ? 'Owned NFAT'
                            : `NFAT #${nfatId}`}
                        </small>
                      </div>
                      <code>
                        {selectedAccount.slice(0, 6)}…
                        {selectedAccount.slice(-4)}
                      </code>
                    </div>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await api<{
                            agent: AgentConnection;
                            token: string;
                          }>('/agents', { name, account: selectedAccount });
                          setToken(result.token);
                          setTokenHost(agentHost);
                          setMessage(
                            `${selectedHost.name} connection created for 24 hours. Copy its setup now; create another connection for each additional client.`,
                          );
                        })
                      }
                    >
                      <PlugZap size={14} />{' '}
                      {hasCurrentCredential
                        ? `Create another ${selectedHost.name} key`
                        : `Create ${selectedHost.name} connection`}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`setup-step ${operations.length ? 'complete' : activeAgents.length ? 'current' : ''}`}
            >
              <span className="step-icon">
                {operations.length ? <Check size={15} /> : <span>5</span>}
              </span>
              <div>
                <strong>Add the Wayleave MCP</strong>
                <p>
                  Install the scoped connection in {selectedHost.name}, then
                  prove it works with one read-only call.
                </p>
                <details className="setup-details" open={hasCurrentCredential}>
                  <summary>
                    <TerminalSquare size={14} /> Show MCP setup{' '}
                    <ChevronDown size={14} />
                  </summary>
                  <div className="setup-details-body">
                    <ol>
                      <li>
                        Use a local checkout of this repository and enter its
                        absolute path below.
                      </li>
                      <li>{mcpDestination}.</li>
                      <li>
                        Restart {selectedHost.name}, then ask the agent to call{' '}
                        <code>get_account</code>.
                      </li>
                    </ol>
                    <label>
                      Wayleave checkout path
                      <input
                        value={repositoryPath}
                        onChange={(event) =>
                          setRepositoryPath(event.target.value)
                        }
                        placeholder="/absolute/path/to/agent-mandate-wallet"
                        spellCheck="false"
                      />
                    </label>
                    <div className="code-block">
                      <pre>{mcpConfig}</pre>
                      <button
                        aria-label="Copy MCP configuration"
                        disabled={
                          !hasCurrentCredential || !checkoutPathIsAbsolute
                        }
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(mcpConfig)
                            .then(() =>
                              setMessage(
                                'MCP configuration copied. Keep the one-time key out of source control.',
                              ),
                            )
                            .catch(() =>
                              setMessage(
                                'Clipboard unavailable. Select and copy the MCP configuration.',
                              ),
                            )
                        }
                      >
                        <Clipboard size={14} /> Copy
                      </button>
                    </div>
                    <div className="tool-chips">
                      <span>
                        get_account <small>read</small>
                      </span>
                      <span>
                        propose_payment <small>request</small>
                      </span>
                      <span>
                        get_operation <small>status</small>
                      </span>
                    </div>
                    <p className="safety-note">
                      <LockKeyhole size={14} /> The adapter never receives an
                      owner signature or private key.
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </section>

          <div className="agent-side">
            <section className="panel connections-panel">
              <div className="panel-heading">
                <Bot size={17} />
                <h3>Connected agents</h3>
                <span>{activeAgents.length.toString().padStart(2, '0')}</span>
              </div>
              {!agents.length ? (
                <div className="compact-empty">
                  <Bot size={19} />
                  <div>
                    <strong>No agents yet</strong>
                    <p>Finish step 3 to create a connection.</p>
                  </div>
                </div>
              ) : (
                agents.map((a) => (
                  <div className="agent-row" key={a.id}>
                    <span
                      className={`agent-avatar ${a.revokedAt ? 'muted' : ''}`}
                    >
                      <Bot size={16} />
                    </span>
                    <div>
                      <strong>{a.name}</strong>
                      <p>
                        {a.revokedAt
                          ? 'Revoked'
                          : a.expiresAt * 1000 <= renderTime
                            ? 'Expired'
                            : `Active until ${new Date(a.expiresAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                    <button
                      className="text-button danger-text"
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
                      Revoke
                    </button>
                  </div>
                ))
              )}
            </section>

            <section className="panel permission-card">
              <div className="panel-heading">
                <KeyRound size={17} />
                <h3>Connection permissions</h3>
              </div>
              <div className="permission-row allowed">
                <CheckCircle2 size={15} />
                <span>Read the connected account</span>
              </div>
              <div className="permission-row allowed">
                <CheckCircle2 size={15} />
                <span>Propose a payment for review</span>
              </div>
              <div className="permission-row denied">
                <X size={15} />
                <span>Sign or submit a payment</span>
              </div>
              <div className="permission-row denied">
                <X size={15} />
                <span>Change token allowance or owner</span>
              </div>
            </section>
          </div>
        </div>

        {token && (
          <section className="key-banner">
            <KeyRound size={18} />
            <div>
              <strong>Your one-time connection key is ready</strong>
              <p>
                Copy it into the MCP configuration now. It will not be shown
                again after you hide it.
              </p>
              <input
                aria-label="Agent connection key"
                type="password"
                readOnly
                value={token}
              />
            </div>
            <div className="key-actions">
              <button
                className="primary"
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
                <Clipboard size={14} /> Copy key
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setToken('');
                  setTokenHost(undefined);
                }}
              >
                Hide
              </button>
            </div>
          </section>
        )}

        <section className="panel approval-panel">
          <div className="approval-head">
            <div>
              <div className="eyebrow">OWNER INBOX</div>
              <h2>Requests and activity</h2>
              <p>
                Every request keeps its purpose, exact amount, destination, and
                evidence together.
              </p>
            </div>
            {signedIn && (
              <div className="inbox-actions">
                <button
                  className="secondary icon-button"
                  aria-label="Refresh requests"
                  disabled={busy}
                  onClick={() => void run(refresh)}
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api('/auth/logout', {});
                      setSession('');
                      setToken('');
                      setTokenHost(undefined);
                      setAgents([]);
                      setOperations([]);
                      setMessage('Signed out.');
                    })
                  }
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
          {!operations.length ? (
            <div className="approval-empty">
              <span>
                <Circle size={10} />
                <i />
                <Bot size={20} />
                <i />
                <ShieldCheck size={20} />
              </span>
              <strong>No requests waiting</strong>
              <p>
                Once the agent proposes a payment, it will appear here for an
                exact review.
              </p>
            </div>
          ) : (
            <div className="operation-list">
              {operations.map((op) => {
                const amount = formatUnits(BigInt(op.intent.amount), 6);
                const agentName =
                  agents.find((a) => a.id === op.agentId)?.name ?? 'Agent';
                const expired = op.intent.expiresAt * 1000 <= renderTime;
                return (
                  <article
                    className={`operation-card ${selected === op.id ? 'selected' : ''}`}
                    key={op.id}
                    id={`operation-${op.id}`}
                  >
                    <div className="operation-top">
                      <span className="agent-avatar">
                        <Bot size={16} />
                      </span>
                      <div>
                        <strong>{op.intent.businessReference}</strong>
                        <p>
                          {agentName} ·{' '}
                          {new Date(op.createdAt * 1000).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`status ${op.status === 'rejected' ? 'blocked' : ''}`}
                      >
                        {op.execution
                          ? op.execution.success
                            ? 'Included'
                            : 'Failed'
                          : op.status === 'approval_required'
                            ? expired
                              ? 'Expired'
                              : 'Needs approval'
                            : op.status === 'approved'
                              ? 'Signed'
                              : 'Rejected'}
                      </span>
                    </div>
                    <div className="payment-summary">
                      <div>
                        <small>AMOUNT</small>
                        <strong>
                          {amount} <span>demo USDC</span>
                        </strong>
                      </div>
                      <div>
                        <small>RECIPIENT</small>
                        <code>
                          {op.intent.recipient.slice(0, 8)}…
                          {op.intent.recipient.slice(-6)}
                        </code>
                      </div>
                      <div>
                        <small>ACCOUNT</small>
                        <code>
                          {op.intent.account.slice(0, 8)}…
                          {op.intent.account.slice(-6)}
                        </code>
                      </div>
                    </div>
                    {op.decisionReason && (
                      <p className="decision-note">{op.decisionReason}</p>
                    )}
                    {op.execution ? (
                      <p className="evidence-note">
                        <CheckCircle2 size={14} />
                        <span>
                          <a
                            href={`https://sepolia.etherscan.io/tx/${op.execution.transactionHash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Payment{' '}
                            {op.execution.success ? 'included' : 'failed'} in
                            block {op.execution.blockNumber} ↗
                          </a>
                          <small>
                            Onchain inclusion only. Finality and service
                            delivery are separate.
                          </small>
                        </span>
                      </p>
                    ) : op.status === 'approved' ? (
                      <div className="recovery-box">
                        <p>
                          Signed, but submission is not recorded. Resume this
                          exact request—do not create a duplicate.
                        </p>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => void run(() => resume(op))}
                        >
                          Resume submission
                        </button>
                        <label>
                          Already submitted? Paste transaction hash
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
                          Verify transaction
                        </button>
                      </div>
                    ) : null}
                    {op.status === 'approval_required' && (
                      <div className="operation-actions">
                        <button
                          className="primary"
                          disabled={busy || expired}
                          onClick={() => void run(() => review(op))}
                        >
                          Review payment <ArrowRight size={14} />
                        </button>
                        <button
                          className="text-button danger-text"
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
                        <div className="review-sheet">
                          <div className="review-title">
                            <ShieldCheck size={17} />
                            <div>
                              <strong>Review the exact action</strong>
                              <p>
                                Your signature binds only this prepared payment.
                              </p>
                            </div>
                          </div>
                          <dl>
                            <div>
                              <dt>Network</dt>
                              <dd>Sepolia</dd>
                            </div>
                            <div>
                              <dt>Payment</dt>
                              <dd>{amount} demo USDC</dd>
                            </div>
                            <div>
                              <dt>Maximum gas reservation</dt>
                              <dd>
                                {formatUnits(
                                  (BigInt(prepared.op.gasFees) &
                                    ((1n << 128n) - 1n)) *
                                    660000n,
                                  18,
                                )}{' '}
                                ETH
                              </dd>
                            </div>
                            <div>
                              <dt>Approval window</dt>
                              <dd>
                                Until{' '}
                                {new Date(
                                  prepared.preparedUntil * 1000,
                                ).toLocaleTimeString()}
                              </dd>
                            </div>
                          </dl>
                          <p className="warning-note">
                            Once signed, the deployed validator does not enforce
                            this review deadline onchain.
                          </p>
                          <button
                            className="primary full-button"
                            disabled={busy}
                            onClick={() => void run(() => signAndSend(op))}
                          >
                            Sign exact payment + submit <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <output className="status-toast">
          <span className="signal-dot" />
          {message}
        </output>
      </div>
    </>
  );
}
