'use client';

import { WayleaveSelect } from '@/components/wayleave-select';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ArchivedRecords } from './archived-records';
import { SetupRouteGuard } from './setup-route-guard';
import Link from 'next/link';
import { SpendingOverview } from './spending-overview';
import { buildAgentSetupGuide } from '../lib/agent-setup-guide';
import { PaymentSetup } from './payment-setup';
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

type AgentHost = 'codex' | 'claude' | 'cursor' | 'generic';

const agentHosts: Array<{
  id: AgentHost;
  name: string;
  detail: string;
}> = [
  { id: 'codex', name: 'Codex', detail: 'Desktop · CLI · IDE' },
  { id: 'claude', name: 'Claude', detail: 'Desktop · Code' },
  { id: 'cursor', name: 'Cursor', detail: 'Editor · Agent' },
  { id: 'generic', name: 'Generic MCP', detail: 'Any local stdio client' },
];
const mcpPackage = 'wayleave-mcp@0.1.2';
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

async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    throw new Error('Clipboard API unavailable');
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

function nowSeconds() {
  return Date.now() / 1000;
}

export function AgentControl({ connectionsOnly = false }: { connectionsOnly?: boolean }) {
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
  const [name, setName] = useState('');
  const [identityLabel, setIdentityLabel] = useState('');
  const [ensAvailability, setEnsAvailability] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'registered' | 'error'
  >('idle');
  const [nfatId, setNfatId] = useState<bigint>();
  const [account, setAccount] = useState('');
  const [token, setToken] = useState('');
  const [tokenHost, setTokenHost] = useState<AgentHost>();
  const [tokenAgentId, setTokenAgentId] = useState('');
  const [setupPayment, setSetupPayment] = useState<string>();
  const [reviewError, setReviewError] = useState<{
    id: string;
    message: string;
  }>();
  const [reviewing, setReviewing] = useState<string>();
  const [activityAgent, setActivityAgent] = useState('all');
  const [requestedOperation, setRequestedOperation] = useState('');
  const [selected, setSelected] = useState<string>();
  const [prepared, setPrepared] = useState<
    Prepared & { preparedUntil: number }
  >();
  const [recoveryHash, setRecoveryHash] = useState('');
  const [renderTime, setRenderTime] = useState(() => Date.now());
  const [mobileStep, setMobileStep] = useState(1);
  const [mobilePro, setMobilePro] = useState(true);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [identityProof, setIdentityProof] = useState('');
  const [identityLoadError, setIdentityLoadError] = useState('');
  const [creationHash, setCreationHash] = useState<Hex>();
  const [uiReady, setUiReady] = useState(false);
  const [setupGuideCopied, setSetupGuideCopied] = useState(false);
  const [copiedAction, setCopiedAction] = useState<'setup' | 'key'>();
  const [connectionComposerOpen, setConnectionComposerOpen] = useState(false);
  useEffect(() => {
    setUiReady(true);
  }, [connectionsOnly]);
  function showDashboard(show: boolean) {
    setMobilePro(show);
    try {
      localStorage.setItem('wayleave.walkthrough.dismissed', String(show));
      const url = new URL(window.location.href);
      if (show) url.searchParams.delete('setup');
      else url.searchParams.set('setup', '1');
      window.history.replaceState(null, '', url);
    } catch {
      /* Storage is optional. */
    }
  }
  const walkthroughOrder = [1, 6, 2, 4, 5];
  const walkthroughLabels = [
    'Connect',
    'Permissions',
    'Agent wallet',
    'Link agent',
    'Ready',
  ];
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
    setToken('');
    setTokenHost(undefined);
    setAccount('');
    setNfatId(undefined);
    setIdentityLabel('');
    setAgents([]);
    setOperations([]);
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
        setToken('');
        setTokenHost(undefined);
        setAgents([]);
        setOperations([]);
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
    function signInFailed(event: Event) {
      setMessage((event as CustomEvent<string>).detail);
      setAuthStage('idle');
    }
    window.addEventListener('wayleave:owner-auth-error', signInFailed);
    window.addEventListener('wayleave:owner-session', sessionChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('wayleave:owner-auth-error', signInFailed);
      window.removeEventListener('wayleave:owner-session', sessionChanged);
    };
  }, [address]);
  useEffect(() => {
    if (isAddress(account) && nfatId !== undefined) return;
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
  }, [account, client, identityLabel, nfatId]);
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
      setIdentityLoadError('');
      setEnsAvailability('registered');
      setMessage(`Spending wallet created: ${agentEnsName(identityLabel)}.`);
      setMobileStep(4);
    }
  }
  async function review(op: Row) {
    await context();
    setSelected(undefined);
    setPrepared(undefined);
    setReviewError(undefined);
    setSetupPayment(op.id);
  }
  async function prepareReview(op: Row) {
    setReviewError(undefined);
    setSelected(undefined);
    setPrepared(undefined);
    setReviewing(op.id);
    try {
      await context();
      const p = await api<Prepared & { preparedUntil: number }>(
        `/operations/${op.id}/prepare`,
        {},
      );
      if (active.current) {
        setSelected(op.id);
        setPrepared(p);
        setSetupPayment(undefined);
        setMessage('Review the exact payment below before signing.');
      }
    } catch (error) {
      if (active.current)
        setReviewError({
          id: op.id,
          message:
            error instanceof Error
              ? error.message
              : 'Payment review failed. Try again.',
        });
      throw error;
    } finally {
      if (active.current) setReviewing(undefined);
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
    if (currentConnector?.id === 'mandate-dev-wallet') {
      await c.wallet.request({
        method: 'mandate_prepareUserOperation' as never,
        params: [packed] as never,
      });
    }
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
  const archivedAgents = agents.filter(
    (item) => !!item.revokedAt || item.expiresAt * 1000 <= renderTime,
  );
  const filteredOperations = operations.filter((op) =>
    requestedOperation ? op.id === requestedOperation : activityAgent === 'all' || op.agentId === activityAgent,
  );
  const archivedOperations = requestedOperation ? [] : filteredOperations.filter((op) => op.intent.expiresAt * 1000 <= renderTime);
  const currentOperations = requestedOperation ? filteredOperations : filteredOperations.filter((op) => op.intent.expiresAt * 1000 > renderTime);
  const archiveKey = `wayleave.hidden.${address?.toLowerCase() ?? 'disconnected'}`;
  const selectedAccount =
    account || activeAgents[0]?.account || agents[0]?.account || '';
  const hasAccount = isAddress(selectedAccount);
  useEffect(() => {
    setIdentityProof('');
  }, [address, selectedAccount]);
  useEffect(() => {
    if (!client || !isAddress(selectedAccount)) return;
    let cancelled = false;
    void (async () => {
      const [registry, tokenId] = await client.readContract({
        address: d.validator,
        abi: nFTOwnerValidatorAbi,
        functionName: 'bindings',
        args: [selectedAccount],
      });
      if (registry.toLowerCase() !== d.registry.toLowerCase())
        throw new Error(
          'This account is not bound to the Wayleave NFAT registry.',
        );
      const [registered, owner, label] = await Promise.all([
        client.readContract({
          address: d.registry,
          abi: kernelAccountFactoryAbi,
          functionName: 'accountOf',
          args: [tokenId],
        }),
        client.readContract({
          address: d.registry,
          abi: kernelAccountFactoryAbi,
          functionName: 'ownerOf',
          args: [tokenId],
        }),
        client.readContract({
          address: d.registry,
          abi: kernelAccountFactoryAbi,
          functionName: 'labelOf',
          args: [tokenId],
        }),
      ]);
      if (
        registered.toLowerCase() !== selectedAccount.toLowerCase() ||
        (address && owner.toLowerCase() !== address.toLowerCase()) ||
        !validLabel(label)
      )
        throw new Error(
          'The NFAT identity no longer matches this owner and account.',
        );
      const ensName = agentEnsName(label);
      const resolved = await client.getEnsAddress({ name: ensName });
      if (resolved?.toLowerCase() !== selectedAccount.toLowerCase())
        throw new Error(`${ensName} does not resolve to this NFAT account.`);
      if (!cancelled && active.current) {
        setAccount(registered);
        setNfatId(tokenId);
        setIdentityLabel(label);
        setIdentityLoadError('');
        setEnsAvailability('registered');
      }
    })().catch((error: unknown) => {
      if (!cancelled && active.current)
        setIdentityLoadError(
          error instanceof Error
            ? error.message
            : 'Could not load the NFAT ENSv2 identity.',
        );
    });
    return () => {
      cancelled = true;
    };
  }, [address, client, selectedAccount]);
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
              ? 'Connect wallet'
              : chainId !== sepolia.id
                ? 'Switch to Sepolia'
                : 'Sign in with wallet';
  const selectedHost = agentHosts.find((host) => host.id === agentHost)!;
  const hasCurrentCredential = !!token && tokenHost === agentHost;
  const credential = hasCurrentCredential
    ? token
    : `<create-a-${agentHost}-connection>`;
  const agentGateway =
    uiReady && !['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? 'https://www.wayleave.xyz/gateway'
      : 'http://127.0.0.1:3001';
  const jsonServer = JSON.stringify(
    {
      mcpServers: {
        wayleave: {
          command: 'bunx',
          args: [mcpPackage],
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
command = "bunx"
args = ["${mcpPackage}"]

[mcp_servers.wayleave.env]
WAYLEAVE_AGENT_TOKEN = "${credential}"
WAYLEAVE_GATEWAY_URL = "${agentGateway}"`
      : jsonServer;
  const mcpDestination =
    agentHost === 'codex'
      ? 'Add to .codex/config.toml or Settings → MCP servers'
      : agentHost === 'cursor'
        ? 'Save as .cursor/mcp.json in your project'
        : agentHost === 'generic'
          ? 'Add the server to your client’s local stdio MCP settings; adapt the JSON wrapper to its format'
          : 'Add to claude_desktop_config.json';
  function copySetupGuide() {
    const guide = buildAgentSetupGuide({
      host: selectedHost.name,
      destination: mcpDestination,
      config: mcpConfig.replaceAll(credential, '<WAYLEAVE_AGENT_TOKEN>'),
      format: agentHost === 'codex' ? 'toml' : 'json',
      gateway: agentGateway,
      account: selectedAccount,
    });
    setSetupGuideCopied(false);
    void copyText(guide)
      .then((copied) => {
        if (!copied) throw new Error('Clipboard unavailable');
        setSetupGuideCopied(true);
        window.setTimeout(() => setSetupGuideCopied(false), 2_000);
        setMessage(
          'Agent setup guide copied. Supply the connection key separately in the client’s private settings.',
        );
      })
      .catch(() =>
        setMessage(
          'Clipboard unavailable. Select and copy the agent setup guide.',
        ),
      );
  }
  function copyConfiguration() {
    setCopiedAction(undefined);
    void copyText(mcpConfig)
      .then((copied) => {
        if (!copied) throw new Error('Clipboard unavailable');
        setCopiedAction('setup');
        window.setTimeout(
          () => setCopiedAction((action) => (action === 'setup' ? undefined : action)),
          2_000,
        );
        setMessage(`${selectedHost.name} setup copied.`);
      })
      .catch(() => setMessage('Select and copy the MCP setup.'));
  }
  function copyConnectionKey() {
    setCopiedAction(undefined);
    void copyText(token)
      .then((copied) => {
        if (!copied) throw new Error('Clipboard unavailable');
        setCopiedAction('key');
        window.setTimeout(
          () => setCopiedAction((action) => (action === 'key' ? undefined : action)),
          2_000,
        );
        setMessage('Connection key copied. Store it in the agent process environment.');
      })
      .catch(() =>
        setMessage('Clipboard unavailable. Select and copy the connection key.'),
      );
  }
  const setupGuideLabel = setupGuideCopied
    ? 'Copied setup guide'
    : 'Copy agent setup guide';
  const identityName = agentEnsName(identityLabel);
  const identityLoaded =
    hasAccount && nfatId !== undefined && !identityLoadError;
  const identityDisplay = identityLoaded
    ? identityName
    : identityLoadError
      ? 'ENSv2 identity unavailable'
      : 'Loading ENSv2 identity…';
  return (
    <>
      <Suspense fallback={null}>
        <SetupRouteGuard
          connectionsOnly={connectionsOnly}
          onDashboardChange={setMobilePro}
          onOperationChange={setRequestedOperation}
        />
      </Suspense>
      <section
        className={`mobile-agent-onboarding ${mobilePro || !uiReady ? 'hidden' : ''}`}
        data-step={mobileStep}
      >
        <div className="mobile-onboarding-top">
          <span className="mobile-wordmark">Sepolia · test funds only</span>
          <button onClick={() => showDashboard(true)}>
            View dashboard <ArrowRight size={14} />
          </button>
        </div>

        <div className="mobile-stage" key={mobileStep}>
          <div className="mobile-step-meta">
            <span>
              Step {walkthroughOrder.indexOf(mobileStep) + 1} of{' '}
              {walkthroughOrder.length}
            </span>
            <i />
            <small>
              {walkthroughLabels[walkthroughOrder.indexOf(mobileStep)]}
            </small>
          </div>

          {mobileStep === 1 && (
            <div className="mobile-step-content">
              <div className="mobile-copy">
                <span className="mobile-kicker">CONNECT WALLET / 01</span>
                <h2>Connect your wallet.</h2>
                <p>
                  Use WalletConnect to scan a QR code, or choose a wallet on
                  this device.
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
                <LockKeyhole size={14} /> Signing in won’t move money.
              </p>
            </div>
          )}

          {mobileStep === 6 && (
            <div className="mobile-step-content">
              <div className="mobile-copy">
                <span className="mobile-kicker">AGENT ACCESS</span>
                <h2>How your agent spends.</h2>
                <p>
                  Give your agent a separate spending wallet. Payments draw from
                  your existing balance, with your approval.
                </p>
              </div>
              <dl className="wallet-ownership-explainer">
                <div><dt>Your wallet</dt><dd>Holds your funds and the NFT that owns the agent wallet.</dd></div>
                <div><dt>Agent wallet</dt><dd>Routes payments from your balance. You approve the amount and recipient.</dd></div>
              </dl>
              <p className="mobile-trust">
                The connection lets your agent read the wallet and request payments. Your signing key stays with you.
              </p>
              <button
                className="mobile-primary"
                onClick={() => {
                  setPolicyAccepted(true);
                  setMobileStep(2);
                }}
              >
                Use these permissions <ArrowRight size={17} />
              </button>
              <p className="mobile-trust">Disconnect your agent at any time.</p>
            </div>
          )}

          {mobileStep === 5 && (
            <div className="mobile-step-content">
              <div className="mobile-copy">
                <span className="mobile-kicker">CONNECTION READY</span>
                <h2>Your agent wallet is ready.</h2>
                <p>
                  In your agent, ask: “Show my Wayleave wallet.” Then ask it to
                  request a payment. You’ll review the request here.
                </p>
              </div>
              <details className="connection-details">
                <summary>Wallet details &amp; verification</summary>
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
                  <output className="mobile-trust">{identityProof}</output>
                )}
                <p className="mobile-trust">
                  Ask your agent to call get_account. Its account address should
                  match this one.
                </p>
              </details>
              <button className="mobile-link" onClick={() => setMobileStep(4)}>
                Back to connection settings
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
              <div className="mobile-copy">
                <span className="mobile-kicker">SPENDING WALLET</span>
                <h2>
                  {hasAccount
                    ? 'Your agent wallet'
                    : 'Name your agent’s wallet'}
                </h2>
                {hasAccount ? (
                  <p>This is the agent wallet owned by the NFT in your connected wallet.</p>
                ) : (
                  <p>
                    We’ll create this agent wallet and mint its ownership NFT to
                    your connected wallet. Your funds stay with you until a payment is approved.
                  </p>
                )}
              </div>
              {hasAccount ? (
                <>
                  <div
                    className="nfat-selector selected"
                    aria-label="ENSv2 identity"
                  >
                    <span>ENS</span>
                    <div>
                      <strong>{identityDisplay}</strong>
                      <small>
                        {identityLoaded
                          ? `Resolves to ${selectedAccount.slice(0, 6)}…${selectedAccount.slice(-4)}`
                          : 'Reading the NFAT registry and resolver'}
                      </small>
                    </div>
                    {identityLoaded && <Check size={15} />}
                  </div>
                  {identityLoadError && (
                    <p className="ens-preview-note" role="alert">
                      {identityLoadError}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label className="mobile-field nfat-name-field">
                    Agent wallet name
                    <span>
                      <input
                        value={identityLabel}
                        onChange={(event) =>
                          setIdentityLabel(event.target.value)
                        }
                        aria-describedby="ens-preview-note"
                      />
                      <b>.{ensV2HackathonDeployment.parentName}</b>
                    </span>
                  </label>
                  <p className="ens-preview-note" id="ens-preview-note">
                    {ensAvailability === 'checking'
                      ? 'Checking this name…'
                      : ensAvailability === 'taken'
                        ? 'Name taken. Try another.'
                        : ensAvailability === 'available'
                          ? 'Available. Registered when you create the account.'
                          : ensAvailability === 'error'
                            ? 'Couldn’t check availability. We’ll check again before creating.'
                            : 'A reusable onchain name for this agent wallet.'}
                  </p>
                </>
              )}
              {hasAccount ? (
                <button
                  className="mobile-primary"
                  onClick={() => setMobileStep(4)}
                >
                  Continue to agent setup
                  <Check size={17} />
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
                  Create agent wallet <ArrowRight size={17} />
                </button>
              )}
              <details className="wallet-ownership-details">
                <summary>How the NFT and wallet work together</summary>
                <p>The NFT records ownership of this wallet on Sepolia. Its ENS name and address identify the same wallet across apps that support them.</p>
                <p>You can connect different agent apps to this wallet. Each connection can be removed separately. The NFT stays in your wallet; some wallet apps may require you to import it to see it.</p>
              </details>
              <p className="mobile-trust">
                <LockKeyhole size={14} /> You’ll review spending access
                separately.
              </p>
            </div>
          )}

          {mobileStep === 4 && (
            <div className="mobile-step-content">
              <div className="mobile-copy">
                <span className="mobile-kicker">LINK YOUR AGENT</span>
                <h2>Connect {selectedHost.name}.</h2>
                <p>
                  Link an app to the agent wallet you just chose. This connection
                  lets it read the wallet and request payments for 24 hours.
                </p>
              </div>
              <div className="agent-host-picker" aria-label="Agent host">
                {agentHosts.map((host) => (
                  <button
                    key={host.id}
                    type="button"
                    aria-pressed={agentHost === host.id}
                    className={agentHost === host.id ? 'selected' : ''}
                    onClick={() => {
                      setAgentHost(host.id);
                      setSetupGuideCopied(false);
                    }}
                  >
                    <span className="agent-host-logo" aria-hidden="true">
                      {/* Static brand SVGs share a fixed optical frame. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/agent-logos/${host.id}.svg`} alt="" width={28} height={28} />
                    </span>
                    <strong>{host.name}</strong>
                    <small>{host.detail}</small>
                    {agentHost === host.id && <Check size={14} />}
                  </button>
                ))}
              </div>
              <details className="wallet-ownership-details connection-label-settings">
                <summary>Add a connection label (optional)</summary>
                <label className="mobile-field">
                  Connection label
                  <input value={name} placeholder={`${selectedHost.name} on my laptop`} onChange={(event) => setName(event.target.value)} />
                </label>
                <p>A label to recognize this app in your activity. It doesn’t rename or create another wallet.</p>
              </details>
              <button
                className="mobile-primary"
                disabled={busy || !signedIn || !isAddress(selectedAccount)}
                onClick={() =>
                  void run(async () => {
                    const result = await api<{
                      agent: AgentConnection;
                      token: string;
                    }>('/agents', { name: name.trim() || `${selectedHost.name} connection`, account: selectedAccount });
                    setToken(result.token);
                    setTokenAgentId(result.agent.id);
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
                  Use a separate connection for each app.
                </p>
              )}
              <details
                className="connection-details"
                open={hasCurrentCredential}
              >
                <summary>Connection settings</summary>
                <div className="mobile-mcp-recipe">
                  <div>
                    <small>01</small>
                    <span>Run the pinned package</span>
                    <code>bunx {mcpPackage}</code>
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
                    <span>Check the connection</span>
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
              </details>
              <button
                className="mobile-primary"
                disabled={!hasCurrentCredential}
                onClick={copyConfiguration}
              >
                {copiedAction === 'setup' ? <Check size={16} /> : <Clipboard size={16} />}{' '}
                {copiedAction === 'setup'
                  ? `Copied ${selectedHost.name} setup`
                  : `Copy ${selectedHost.name} setup`}
              </button>
              <button className="secondary" onClick={copySetupGuide}>
                {setupGuideCopied ? <Check size={16} /> : <Clipboard size={16} />}{' '}
                {setupGuideLabel}
              </button>
              <p className="mobile-trust">
                {mcpDestination}.{' '}
                {agentGateway.startsWith('http://127.0.0.1')
                  ? 'Keep bun run gateway running locally.'
                  : 'This setup uses the hosted Wayleave gateway.'}
              </p>
              <button className="mobile-link" onClick={() => setMobileStep(5)}>
                Continue to account
              </button>
            </div>
          )}
        </div>

        <fieldset className="mobile-step-nav" aria-label="Onboarding steps">
          {walkthroughOrder.map((step, index) => (
            <button
              key={step}
              className={mobileStep === step ? 'active' : ''}
              aria-label={`Go to step ${index + 1}`}
              aria-current={mobileStep === step ? 'step' : undefined}
              title={walkthroughLabels[index]}
              onClick={() => setMobileStep(step)}
            />
          ))}
        </fieldset>
        <output className="mobile-status" aria-live="polite">
          {message !== 'Sign in to connect an agent and review its requests.'
            ? message
            : ''}
        </output>
      </section>

      <div
        className={`agent-shell desktop-agent-pro ${connectionsOnly ? 'connections-workspace' : ''} ${mobilePro && uiReady ? 'show-on-mobile' : ''} ${requestedOperation ? 'focused-payment' : ''}`}
      >
        {connectionsOnly && (
          <section className={`connection-page ${signedIn ? 'is-ready' : ''}`}>
            <div className="connection-page-mark" aria-hidden="true">
              <PlugZap size={20} strokeWidth={1.6} />
            </div>
            <div>
              <span className="eyebrow">CONNECT AN AGENT</span>
              <h1>{signedIn ? 'Connections' : 'Connect your wallet'}</h1>
              <p>{address
                ? signedIn
                  ? 'Give each agent app its own connection. You can revoke access at any time.'
                  : `Verify ${address.slice(0, 6)}…${address.slice(-4)} to manage its agent connections.`
                : 'Verify ownership before creating a connection. Signing in does not move money.'}</p>
            </div>
            {!signedIn && (
              <button
                className="primary"
                disabled={!uiReady || busy || authStage !== 'idle'}
                onClick={() => void run(login)}
              >
                {uiReady ? authLabel : 'Checking wallet…'} <ArrowRight size={16} />
              </button>
            )}
          </section>
        )}
        {!connectionsOnly && (!requestedOperation || !signedIn) && (
          <SpendingOverview
            signedIn={signedIn}
            agents={agents}
            operations={operations}
            now={renderTime}
            busy={busy || authStage !== 'idle'}
            authLabel={authLabel}
            onConnect={() => {
              if (!requestedOperation) showDashboard(false);
              void run(login);
            }}
            onSetup={() => showDashboard(false)}
          />
        )}

        {signedIn && !requestedOperation && connectionsOnly && (
          <div
            className={`connections-command-center ${activeAgents.length ? 'has-connections' : 'no-connections'}`}
          >
            {!!activeAgents.length && (
              <section className="panel connection-roster">
                <div className="connection-roster-head">
                  <div>
                    <span className="eyebrow">ACTIVE</span>
                    <h2>Your connections</h2>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => {
                      setConnectionComposerOpen((open) => !open);
                      setToken('');
                      setTokenHost(undefined);
                    }}
                    aria-expanded={connectionComposerOpen || !!token}
                    aria-controls="new-connection"
                  >
                    {connectionComposerOpen || token ? <X size={15} /> : <PlugZap size={15} />}
                    {connectionComposerOpen || token ? 'Close' : 'Add connection'}
                  </button>
                </div>
                <div className="connection-roster-list">
                  {activeAgents.map((agent) => (
                    <div className="connection-roster-row" key={agent.id}>
                      <span className="agent-avatar" aria-hidden="true">
                        <Bot size={17} />
                      </span>
                      <div>
                        <strong>{agent.name}</strong>
                        <p>
                          Active until{' '}
                          {new Date(agent.expiresAt * 1000).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <span className="connection-status">Active</span>
                      <button
                        className="text-button danger-text"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(`/agents/${agent.id}/revoke`, {});
                            if (agent.id === tokenAgentId) {
                              setToken('');
                              setTokenHost(undefined);
                            }
                            setMessage(
                              'Agent API access revoked. Existing signed payments and token allowances are unchanged.',
                            );
                          })
                        }
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
                <ArchivedRecords
                  key={`${archiveKey}.connections`}
                  title="Past connections"
                  storageKey={`${archiveKey}.connections`}
                  records={archivedAgents.map((agent) => ({
                    id: agent.id,
                    title: agent.name,
                    detail: `${agent.revokedAt ? 'Revoked' : 'Expired'} · ${new Date((agent.revokedAt ?? agent.expiresAt) * 1000).toLocaleDateString()}`,
                  }))}
                />
              </section>
            )}

            {(!activeAgents.length || connectionComposerOpen || !!token) && (
              <section className="panel connection-composer" id="new-connection">
                <div className="connection-composer-head">
                  <div>
                    <span className="eyebrow">
                      {token ? 'READY TO INSTALL' : hasAccount ? 'NEW CONNECTION' : 'AGENT WALLET'}
                    </span>
                    <h2>
                      {token
                        ? `Finish in ${selectedHost.name}`
                        : hasAccount
                          ? activeAgents.length
                            ? 'Connect another app'
                            : 'Choose where your agent runs'
                          : 'Name your agent wallet'}
                    </h2>
                    <p>
                      {token
                        ? `${selectedHost.name} has a private setup ready. Copy it now—it is only shown once.`
                        : hasAccount
                          ? 'This connection can read the agent wallet and request payments for 24 hours. You still approve spending.'
                          : 'Create the onchain wallet your agent will use. Its ownership NFT stays in your wallet.'}
                    </p>
                  </div>
                  <span className="connection-step-pill">
                    {token ? '3 of 3' : hasAccount ? '2 of 3' : '1 of 3'}
                  </span>
                </div>

                {!hasAccount ? (
                  <div className="connection-current-action">
                    <label className="desktop-name-field">
                      Agent wallet name
                      <span>
                        <input
                          value={identityLabel}
                          onChange={(event) => setIdentityLabel(event.target.value)}
                        />
                        <b>.{ensV2HackathonDeployment.parentName}</b>
                      </span>
                    </label>
                    <p className="ens-rollout-note">
                      {ensAvailability === 'taken'
                        ? 'That Wayleave name is already registered. Choose another.'
                        : ensAvailability === 'checking'
                          ? 'Checking the live Wayleave registry…'
                          : 'The ownership NFT, agent wallet, and name are created together on Sepolia.'}
                    </p>
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !validLabel(identityLabel) ||
                        ensAvailability === 'checking' ||
                        ensAvailability === 'taken'
                      }
                      onClick={() => void run(createNfat)}
                    >
                      Create agent wallet <ArrowRight size={15} />
                    </button>
                  </div>
                ) : token ? (
                  <div className="connection-handoff">
                    <div className="connection-handoff-destination">
                      <span className="agent-host-logo" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/agent-logos/${selectedHost.id}.svg`} alt="" width={28} height={28} />
                      </span>
                      <div>
                        <strong>{selectedHost.name}</strong>
                        <p>{mcpDestination}</p>
                      </div>
                    </div>
                    <div className="code-block connection-setup-code">
                      <pre>{mcpConfig}</pre>
                    </div>
                    <div className="connection-handoff-actions">
                      <button
                        className="primary"
                        onClick={copyConfiguration}
                      >
                        {copiedAction === 'setup' ? <Check size={15} /> : <Clipboard size={15} />}{' '}
                        {copiedAction === 'setup'
                          ? `Copied ${selectedHost.name} setup`
                          : `Copy ${selectedHost.name} setup`}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          setToken('');
                          setTokenHost(undefined);
                          setConnectionComposerOpen(false);
                        }}
                      >
                        Done
                      </button>
                    </div>
                    <p className="connection-secret-note">
                      The setup includes a one-time key. Keep it in private client settings and out of chat or source control.
                    </p>
                  </div>
                ) : (
                  <div className="connection-current-action">
                    <div className="desktop-host-picker connection-host-grid" aria-label="Agent host">
                      {agentHosts.map((host) => (
                        <button
                          key={host.id}
                          type="button"
                          aria-pressed={agentHost === host.id}
                          className={agentHost === host.id ? 'selected' : ''}
                          onClick={() => {
                            setAgentHost(host.id);
                            setSetupGuideCopied(false);
                          }}
                        >
                          <span className="agent-host-logo" aria-hidden="true">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/agent-logos/${host.id}.svg`} alt="" width={28} height={28} />
                          </span>
                          {host.name}
                        </button>
                      ))}
                    </div>
                    <label className="connection-label-field">
                      Connection label <span>Optional</span>
                      <input
                        value={name}
                        placeholder={`${selectedHost.name} on my laptop`}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </label>
                    <div className="connection-wallet-row">
                      <div>
                        <span>Agent wallet</span>
                        <strong>{identityDisplay}</strong>
                      </div>
                      <code>{selectedAccount.slice(0, 6)}…{selectedAccount.slice(-4)}</code>
                    </div>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await api<{
                            agent: AgentConnection;
                            token: string;
                          }>('/agents', {
                            name: name.trim() || `${selectedHost.name} connection`,
                            account: selectedAccount,
                          });
                          setToken(result.token);
                          setTokenAgentId(result.agent.id);
                          setTokenHost(agentHost);
                          setConnectionComposerOpen(true);
                          setMessage(`${selectedHost.name} connection created.`);
                        })
                      }
                    >
                      Create {selectedHost.name} connection <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </section>
            )}

            <details className="connection-access-summary">
              <summary>What a connection can do <ChevronDown size={15} /></summary>
              <div>
                <p><CheckCircle2 size={15} /> Read the connected agent wallet</p>
                <p><CheckCircle2 size={15} /> Propose a payment for your review</p>
                <p><X size={15} /> Sign or submit a payment</p>
                <p><X size={15} /> Change ownership or token allowances</p>
              </div>
            </details>
          </div>
        )}

        {signedIn && !requestedOperation && !connectionsOnly && (
          <div className="agent-grid">
            <details className="panel setup-panel" open={connectionsOnly ? true : undefined}>
              <summary className="setup-disclosure">
                Create an MCP connection <ChevronDown size={16} />
              </summary>
              <div className="setup-head">
                <div>
                  <div className="eyebrow">GET STARTED</div>
                  <h2>{agents.length ? 'Connect another agent' : 'Connect your first agent'}</h2>
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

              <div
                className={`setup-step ${signedIn ? 'complete' : 'current'}`}
              >
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
                  <strong>Name your account</strong>
                  <p>
                    Create a named account that you own. This uses Sepolia test
                    ETH.
                  </p>
                  {signedIn && (
                    <div className="connection-form nfat-create-form">
                      {hasAccount ? (
                        <>
                          <div
                            className="desktop-nfat-selected"
                            aria-label="ENSv2 identity"
                          >
                            <span>ENS</span>
                            <div>
                              <strong>{identityDisplay}</strong>
                              <small>
                                {identityLoaded
                                  ? `NFAT #${nfatId}`
                                  : 'Loading from Sepolia'}
                              </small>
                            </div>
                            <code>
                              {selectedAccount.slice(0, 6)}…
                              {selectedAccount.slice(-4)}
                            </code>
                          </div>
                          <p
                            className="ens-rollout-note"
                            role={identityLoadError ? 'alert' : undefined}
                          >
                            {identityLoadError ||
                              'Loaded from the NFAT registry and verified with the ENSv2 resolver. This identity is not editable here.'}
                          </p>
                        </>
                      ) : (
                        <>
                          <label className="desktop-name-field">
                            Agent wallet name
                            <span>
                              <input
                                value={identityLabel}
                                onChange={(e) =>
                                  setIdentityLabel(e.target.value)
                                }
                              />
                              <b>.{ensV2HackathonDeployment.parentName}</b>
                            </span>
                          </label>
                          <button
                            className="primary"
                            disabled={
                              busy ||
                              !validLabel(identityLabel) ||
                              ensAvailability === 'checking' ||
                              ensAvailability === 'taken'
                            }
                            onClick={() => void run(createNfat)}
                          >
                            <KeyRound size={14} /> Create account
                          </button>
                          <p className="ens-rollout-note">
                            {ensAvailability === 'taken'
                              ? 'That Wayleave name is already registered. Choose another.'
                              : ensAvailability === 'checking'
                                ? 'Checking the live Wayleave registry…'
                                : 'The NFAT, smart account, and Wayleave ENSv2 subname are created together.'}
                          </p>
                        </>
                      )}
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
                  <strong>Connect your agent</strong>
                  <p>
                    Each agent gets a separate connection that you can revoke.
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
                            onClick={() => {
                              setAgentHost(host.id);
                              setSetupGuideCopied(false);
                            }}
                          >
                            <span className="agent-host-logo" aria-hidden="true">
                      {/* Static brand SVGs share a fixed optical frame. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/agent-logos/${host.id}.svg`} alt="" width={28} height={28} />
                    </span>
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
                          <strong>{identityDisplay}</strong>
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
                            }>('/agents', { name: name.trim() || `${selectedHost.name} connection`, account: selectedAccount });
                            setToken(result.token);
                    setTokenAgentId(result.agent.id);
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
                  <details
                    className="setup-details"
                    open={hasCurrentCredential}
                  >
                    <summary>
                      <TerminalSquare size={14} /> Show MCP setup{' '}
                      <ChevronDown size={14} />
                    </summary>
                    <div className="setup-details-body">
                      <ol>
                        <li>
                          {selectedHost.name} runs the pinned {mcpPackage}{' '}
                          package from npm. No Wayleave checkout is required.
                        </li>
                        <li>{mcpDestination}.</li>
                        <li>
                          Restart {selectedHost.name}, then ask the agent to
                          call <code>get_account</code>.
                        </li>
                      </ol>
                      <div className="code-block">
                        <pre>{mcpConfig}</pre>
                        <button
                          aria-label="Copy MCP configuration"
                          disabled={!hasCurrentCredential}
                          onClick={copyConfiguration}
                        >
                          {copiedAction === 'setup' ? <Check size={14} /> : <Clipboard size={14} />}{' '}
                          {copiedAction === 'setup' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <button className="secondary" onClick={copySetupGuide}>
                        {setupGuideCopied ? <Check size={14} /> : <Clipboard size={14} />}{' '}
                        {setupGuideLabel}
                      </button>
                      <p>The guide omits your key. Supply it separately in private client settings.</p>
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
            </details>

            <div className="agent-side">
              <section className="panel connections-panel">
                <div className="panel-heading">
                  <Bot size={17} />
                  <h3>Connected agents</h3>
                  <span>{activeAgents.length.toString().padStart(2, '0')}</span>
                </div>
                {!activeAgents.length ? (
                  <div className="compact-empty">
                    <Bot size={19} />
                    <div>
                      <strong>No active agents</strong>
                      <p>Set up an agent to get started.</p>
                    </div>
                  </div>
                ) : (
                  activeAgents.map((a) => (
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
                            if (a.id === tokenAgentId) {
                              setToken('');
                              setTokenHost(undefined);
                            }
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
                <ArchivedRecords
                  key={`${archiveKey}.agents`}
                  title="Expired & revoked agents"
                  storageKey={`${archiveKey}.agents`}
                  records={archivedAgents.map((agent) => ({
                    id: agent.id,
                    title: agent.name,
                    detail: `${agent.revokedAt ? 'Revoked' : 'Expired'} · ${new Date((agent.revokedAt ?? agent.expiresAt) * 1000).toLocaleDateString()}`,
                  }))}
                />
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
        )}

        {token && !connectionsOnly && (
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
                onClick={copyConnectionKey}
              >
                {copiedAction === 'key' ? <Check size={14} /> : <Clipboard size={14} />}{' '}
                {copiedAction === 'key' ? 'Copied key' : 'Copy key'}
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

        {signedIn && !connectionsOnly && (
          <section className="panel approval-panel" id="activity">
            <div className="approval-head">
              <div>
                <h2>{requestedOperation ? 'Payment request' : 'Activity'}</h2>
                {requestedOperation && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setRequestedOperation('');
                      window.history.replaceState(null, '', '/');
                    }}
                  >
                    View all payments
                  </button>
                )}
              </div>
              {signedIn && !requestedOperation && (
                <div className="inbox-actions">
                  <button
                    className="secondary icon-button"
                    aria-label="Refresh requests"
                    disabled={busy}
                    onClick={() => void run(refresh)}
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              )}
            </div>
            {!requestedOperation && signedIn && agents.length > 1 && (
              <label className="activity-filter" htmlFor="activity-agent">
                Show activity for
                <WayleaveSelect id="activity-agent" label="Show activity for" value={activityAgent} onValueChange={setActivityAgent}
                  options={[{ value: 'all', label: 'All agents' }, ...agents.map(agent => ({ value: agent.id, label: agent.name }))]} />
              </label>
            )}
            {!currentOperations.length && !archivedOperations.length ? (
              <div className="approval-empty">
                <span>
                  <Circle size={10} />
                  <i />
                  <Bot size={20} />
                  <i />
                  <ShieldCheck size={20} />
                </span>
                <strong>
                  {signedIn
                    ? requestedOperation
                      ? 'Request unavailable'
                      : 'No payment requests to show'
                    : 'Your activity is private'}
                </strong>
                <p>
                  {signedIn
                    ? requestedOperation
                      ? 'This request may belong to another wallet. Check the connected owner or ask your agent for a new link.'
                      : 'Ask your agent to request a payment. It will appear here.'
                    : 'Connect and verify your wallet to see your agents and payment history.'}
                </p>
              </div>
            ) : (
              <div className="operation-list">
                {currentOperations
                  .map((op) => {
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
                                ? 'Paid'
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
                              {op.intent.recipient}
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
                                {op.execution.success ? 'included' : 'failed'}{' '}
                                in block {op.execution.blockNumber} ↗
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
                              Signed, but submission is not recorded. Resume
                              this exact request—do not create a duplicate.
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
                                onChange={(e) =>
                                  setRecoveryHash(e.target.value)
                                }
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
                        {op.status === 'approval_required' && selected !== op.id && setupPayment !== op.id && (
                          <div className="operation-actions">
                            <button
                              className="primary"
                              disabled={busy || expired}
                              onClick={() => void run(() => review(op))}
                            >
                              {reviewing === op.id
                                ? 'Checking payment…'
                                : 'Review payment'}{' '}
                              <ArrowRight size={14} />
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
                        {setupPayment === op.id &&
                          op.status === 'approval_required' && (
                            <PaymentSetup
                              key={op.id}
                              intent={op.intent}
                              onReady={() => prepareReview(op)}
                              onBusyChange={setBusy}
                            />
                          )}
                        {reviewError?.id === op.id && (
                          <div className="recovery-box" role="alert">
                            <p>{reviewError.message}</p>
                            <a
                              href={`/accounts?account=${encodeURIComponent(op.intent.account)}`}
                            >
                              Open Account funding settings →
                            </a>
                            <p>
                              Account to load: <code>{op.intent.account}</code>
                            </p>
                          </div>
                        )}
                        {selected === op.id &&
                          prepared &&
                          op.status === 'approval_required' && (
                            <div className="review-sheet">
                              <div className="payment-progress-heading">
                                <strong>Confirm payment</strong>
                                <span>Final step</span>
                              </div>
                              <dl>
                                <div>
                                  <dt>Payment gas limit</dt>
                                  <dd>{formatUnits((BigInt(prepared.op.gasFees) & ((1n << 128n) - 1n)) * 660000n, 18)} Sepolia ETH</dd>
                                </div>
                              </dl>
                              <p className="footnote">Sign this payment, then confirm submission in your wallet. Your wallet also submits the transaction; its transaction fee is shown there.</p>
                              <details className="payment-extra-details">
                                <summary>Wallet and signature details</summary>
                                <dl>
                                  <div><dt>From your wallet</dt><dd><code>{op.intent.fundingOwner}</code></dd></div>
                                  <div><dt>Through spending wallet</dt><dd><code>{op.intent.account}</code></dd></div>
                                  <div><dt>Review valid until</dt><dd>{new Date(prepared.preparedUntil * 1000).toLocaleTimeString()}</dd></div>
                                </dl>
                                <p className="footnote">A signed payment remains usable after this review expires. The deployed validator does not enforce a signature deadline.</p>
                              </details>
                              <button
                                className="primary full-button"
                                disabled={busy}
                                onClick={() => void run(() => signAndSend(op))}
                              >
                                Approve &amp; pay <ArrowRight size={14} />
                              </button>
                            </div>
                          )}
                      </article>
                    );
                  })}
              </div>
            )}
            {!requestedOperation && <ArchivedRecords
              key={`${archiveKey}.activity`}
              title="Expired activity"
              storageKey={`${archiveKey}.activity`}
              records={archivedOperations.map((op) => ({
                id: op.id,
                title: op.intent.businessReference,
                detail: `${formatUnits(BigInt(op.intent.amount), 6)} demo USDC · ${op.execution ? (op.execution.success ? 'Paid' : 'Failed') : op.status === 'rejected' ? 'Rejected' : op.status === 'approved' ? 'Signed · expired' : 'Expired'} · ${new Date(op.createdAt * 1000).toLocaleDateString()}`,
                href: `/?operation=${encodeURIComponent(op.id)}`,
              }))}
            />}
          </section>
        )}

        {message !== 'Sign in to connect an agent and review its requests.' &&
          !message.startsWith('Owner verified.') &&
          message !== 'Review the exact payment below before signing.' &&
          message !== 'Payment included; delivery not recorded.' && (
            <output className="status-toast">
              <span className="signal-dot" />
              {message}
            </output>
          )}
      </div>
    </>
  );
}
