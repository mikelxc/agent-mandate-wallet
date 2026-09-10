'use client';
import { useState } from 'react';
import PasskeyOnboarding from '../../components/account-access';
import { AppFrame } from '../../components/app-frame';
import { KernelWorkspace } from '../../components/kernel-workspace';
import { usePolicyTools } from '../../hooks/use-policy-tools';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  useConnection,
  useConnect,
  useConnectors,
  useDisconnect,
  usePublicClient,
  useWriteContract,
  useSwitchChain,
} from 'wagmi';
import { decodeEventLog, isAddress, formatUnits, type Address } from 'viem';
import {
  accountFactoryAbi,
  operatingAccountAbi,
  evaluatePayment,
  usdc,
  validLabel,
} from '@mandate/sdk';
import {
  ArrowUpRight,
  ShieldCheck,
  Wallet,
  SlidersHorizontal,
  Activity,
  Plus,
  Check,
  X,
  Fingerprint,
  ChevronRight,
  ExternalLink,
  KeyRound,
} from 'lucide-react';
type Receipt = {
  id: string;
  action: string;
  status: string;
  amount: string;
  detail: string;
};
export default function AdvancedWorkspace() {
  const [tab, setTab] = useState<'preview' | 'live' | 'kernel'>('preview');
  const [label, setLabel] = useState('research-desk');
  const [limit, setLimit] = useState('5');
  const [budget, setBudget] = useState('20');
  const [spent, setSpent] = useState('0');
  const [revoked, setRevoked] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [factory, setFactory] = useState('');
  const [account, setAccount] = useState('');
  const [asset, setAsset] = useState('');
  const [agent, setAgent] = useState('');
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [walletError, setWalletError] = useState('');
  const wallet = useConnection();
  const connect = useConnect();
  const connectors = useConnectors();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const client = usePublicClient();
  const write = useWriteContract();
  const preferredConnector =
    connectors.find((connector) => connector.id === 'mandate-dev-wallet') ??
    connectors[0];
  function requestWallet() {
    setWalletError('');
    setWalletDialogOpen(true);
  }
  function connectWallet() {
    if (!preferredConnector) {
      setWalletError(
        'No wallet is available in this browser. Open the preview in a browser with a wallet extension.',
      );
      return;
    }
    connect.mutate(
      { connector: preferredConnector },
      {
        onSuccess: () => {
          setWalletError('');
          setWalletDialogOpen(false);
        },
        onError: () =>
          setWalletError(
            'No wallet responded. Open this preview in a wallet-enabled browser, then try again.',
          ),
      },
    );
  }
  const tabMeta = {
    kernel: {
      eyebrow: 'ONCHAIN SETUP',
      title: 'Sepolia account',
      description: 'Create, fund, and operate a test account you control.',
    },
    preview: {
      eyebrow: 'SAFE TO EXPLORE',
      title: 'Policy playground',
      description:
        'See how limits behave before any wallet or funds are involved.',
    },
    live: {
      eyebrow: 'REFERENCE IMPLEMENTATION',
      title: 'Contract workspace',
      description: 'Inspect the original bounded-account contract flow.',
    },
  }[tab];
  usePolicyTools(
    {
      recipient: 'approved-provider',
      perPayment: limit,
      budget,
      spent,
      revoked,
    },
    completed,
  );
  function simulate(kind: 'buy' | 'attack' | 'repeat' | 'delivery') {
    const id =
      kind === 'repeat' ? 'request-1' : `request-${receipts.length + 1}`;
    const destination =
      kind === 'attack' ? 'unknown-provider' : 'approved-provider';
    const amount = '3';
    const denial = evaluatePayment(
      {
        recipient: 'approved-provider',
        perPayment: limit,
        budget,
        spent,
        revoked,
      },
      { id, recipient: destination, amount },
      completed,
    );
    if (!denial) {
      setSpent(formatUnits(usdc(spent) + usdc(amount), 6));
      setCompleted(new Set([...completed, id]));
    }
    setReceipts([
      {
        id: `${id}-${receipts.length}`,
        action:
          kind === 'attack'
            ? 'Unapproved destination'
            : kind === 'repeat'
              ? 'Duplicate request'
              : 'Market data report',
        status: denial
          ? 'Blocked'
          : kind === 'delivery'
            ? 'Delivery failed'
            : 'Completed',
        amount: denial ? '0' : amount,
        detail:
          denial ??
          (kind === 'delivery'
            ? 'Payment confirmed. Service unavailable; do not pay again.'
            : 'Payment confirmed · report received'),
      },
      ...receipts,
    ]);
  }
  async function transact(action: 'create' | 'grant') {
    if (!client || !wallet.address) return;
    setBusy(true);
    setMessage('Waiting for wallet approval…');
    try {
      if (!validLabel(label))
        throw new Error(
          'Use 3–32 lowercase letters, numbers, or internal hyphens.',
        );
      let hash;
      if (action === 'create') {
        if (!isAddress(factory))
          throw new Error('Enter the deployed factory address.');
        if ((await client.getCode({ address: factory })) === undefined)
          throw new Error(
            'No factory contract exists at this address on the selected network.',
          );
        hash = await write.mutateAsync({
          address: factory,
          abi: accountFactoryAbi,
          functionName: 'createAccount',
          args: [label],
        });
      } else {
        if (
          ![account, asset, agent, recipient].every((value) => isAddress(value))
        )
          throw new Error(
            'Enter valid account, token, agent, and recipient addresses.',
          );
        hash = await write.mutateAsync({
          address: account as Address,
          abi: operatingAccountAbi,
          functionName: 'grant',
          args: [
            agent as Address,
            asset as Address,
            recipient as Address,
            usdc(limit),
            usdc(budget),
            BigInt(Math.floor(Date.now() / 1000) + 86400),
          ],
        });
      }
      setMessage(`Confirming ${hash.slice(0, 12)}…`);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success')
        throw new Error(
          'Transaction reverted. No successful change was recorded.',
        );
      if (action === 'create')
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({
              abi: accountFactoryAbi,
              data: log.data,
              topics: log.topics,
            });
            if (decoded.eventName === 'AccountCreated')
              setAccount(decoded.args.account);
          } catch {
            /* Other factory events are expected. */
          }
        }
      setMessage(
        `${action === 'create' ? 'Account created' : 'Mandate granted'}. Transaction: ${hash}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Transaction failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppFrame active="tools">
      <div className="workspace developer-workspace">
        <div className="developer-main">
          <div className="developer-toolbar">
            <span>Developer tools</span>
            <button
              className="secondary"
              onClick={() =>
                wallet.isConnected ? disconnect.mutate() : requestWallet()
              }
            >
              {wallet.address
                ? `${wallet.connector?.id === 'mandate-dev-wallet' ? 'LOCAL TEST · ' : ''}${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
                : 'Connect wallet'}{' '}
              <ArrowUpRight size={14} />
            </button>
          </div>
          <section className="content">
            <div className="page-title">
              <div>
                <div className="eyebrow">{tabMeta.eyebrow}</div>
                <h1>{tabMeta.title}</h1>
                <p>{tabMeta.description}</p>
              </div>
              <span className="network">
                <span /> Sepolia testnet
              </span>
            </div>
            <div className="tabs" aria-label="Developer views">
              <button
                className={tab === 'kernel' ? 'selected' : ''}
                onClick={() => setTab('kernel')}
              >
                Sepolia wallet
              </button>
              <button
                className={tab === 'preview' ? 'selected' : ''}
                onClick={() => setTab('preview')}
              >
                Policy playground
              </button>
              <button
                className={tab === 'live' ? 'selected' : ''}
                onClick={() => setTab('live')}
              >
                Reference contracts <ArrowUpRight size={14} />
              </button>
            </div>
            {tab === 'kernel' ? (
              <>
                <PasskeyOnboarding />
                <KernelWorkspace key={`${wallet.address}-${wallet.chainId}`} />
              </>
            ) : (
              <>
                <div className="account-banner">
                  <div className="account-icon">
                    <Fingerprint size={30} />
                  </div>
                  <div>
                    <h2>{label || 'Untitled account'}</h2>
                    <p>
                      {tab === 'preview'
                        ? 'Local simulation · no funds move'
                        : 'Connected contracts · wallet approval required'}
                    </p>
                  </div>
                  <span
                    className={`status ${revoked && tab === 'preview' ? 'blocked' : ''}`}
                  >
                    {revoked && tab === 'preview'
                      ? 'Revoked'
                      : 'Owner controlled'}
                  </span>
                </div>
                <div className="columns">
                  <section className="panel">
                    <div className="panel-heading">
                      <SlidersHorizontal size={18} />
                      <h3>Account configuration</h3>
                      <span>01</span>
                    </div>
                    <label>
                      Account label
                      <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        maxLength={32}
                      />
                    </label>
                    <div className="field-note">
                      ENS subname registration requires a configured Sepolia
                      adapter.
                    </div>
                    <div className="field-row">
                      <label>
                        Per payment <span>USDC</span>
                        <input
                          value={limit}
                          inputMode="decimal"
                          onChange={(e) => setLimit(e.target.value)}
                        />
                      </label>
                      <label>
                        Total budget <span>USDC</span>
                        <input
                          value={budget}
                          inputMode="decimal"
                          onChange={(e) => setBudget(e.target.value)}
                        />
                      </label>
                    </div>
                    {tab === 'preview' ? (
                      <>
                        <div className="form-label">
                          Permitted service
                          <div className="readonly">
                            <Check size={16} /> Approved data provider
                          </div>
                        </div>
                        <div className="rule">
                          <ShieldCheck size={18} />
                          <div>
                            <strong>Payment-only authority</strong>
                            <p>
                              Fixed recipient. Fixed asset. No arbitrary
                              contract calls.
                            </p>
                          </div>
                        </div>
                        <button
                          className="danger"
                          disabled={revoked}
                          onClick={() => setRevoked(true)}
                        >
                          Revoke agent access
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            setRevoked(false);
                            setSpent('0');
                            setReceipts([]);
                            setCompleted(new Set());
                          }}
                        >
                          Reset simulation
                        </button>
                      </>
                    ) : (
                      <>
                        <label>
                          Network
                          <select
                            value={
                              wallet.chainId === 11155111 ? 11155111 : 31337
                            }
                            onChange={(e) =>
                              switchChain.mutate({
                                chainId: Number(e.target.value),
                              })
                            }
                            disabled={!wallet.isConnected}
                          >
                            <option value={31337}>Anvil · local</option>
                            <option value={11155111}>Sepolia · ENSv2</option>
                          </select>
                        </label>
                        <label>
                          Factory address
                          <input
                            placeholder="0x…"
                            value={factory}
                            onChange={(e) => setFactory(e.target.value)}
                          />
                        </label>
                        <button
                          className="primary"
                          disabled={!wallet.isConnected || busy}
                          onClick={() => void transact('create')}
                        >
                          <Plus size={16} /> Create account
                        </button>
                      </>
                    )}
                  </section>
                  <section className="panel operation">
                    <div className="panel-heading">
                      <Activity size={18} />
                      <h3>
                        {tab === 'preview'
                          ? 'Try an operation'
                          : 'Grant payment authority'}
                      </h3>
                      <span>02</span>
                    </div>
                    {tab === 'preview' ? (
                      <>
                        <div className="balance">
                          <span>Spent in this simulation</span>
                          <div>
                            {spent}
                            <small> / {budget} USDC</small>
                          </div>
                        </div>
                        <div className="scenario">
                          <div>
                            <strong>Purchase a data report</strong>
                            <p>Approved provider · 3 USDC per request</p>
                          </div>
                          <button
                            className="primary"
                            onClick={() => simulate('buy')}
                          >
                            Run request <ArrowUpRight size={16} />
                          </button>
                        </div>
                        <div className="negative-title">
                          TEST THE BOUNDARIES
                        </div>
                        <button
                          className="scenario-button"
                          onClick={() => simulate('attack')}
                        >
                          <span>Change the payment destination</span>
                          <ArrowUpRight size={16} />
                        </button>
                        <button
                          className="scenario-button"
                          onClick={() => simulate('repeat')}
                        >
                          <span>Replay the first request</span>
                          <ArrowUpRight size={16} />
                        </button>
                        <button
                          className="scenario-button"
                          onClick={() => simulate('delivery')}
                        >
                          <span>Pay successfully, fail service delivery</span>
                          <ArrowUpRight size={16} />
                        </button>
                        <p className="footnote">
                          These controls simulate policy behavior. Contract
                          enforcement is verified separately in Foundry tests.
                        </p>
                      </>
                    ) : (
                      <>
                        <label>
                          Operating account
                          <input
                            placeholder="Created account address"
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                          />
                        </label>
                        <label>
                          Token address
                          <input
                            placeholder="Demo USDC or testnet token"
                            value={asset}
                            onChange={(e) => setAsset(e.target.value)}
                          />
                        </label>
                        <label>
                          Agent signer
                          <input
                            placeholder="0x…"
                            value={agent}
                            onChange={(e) => setAgent(e.target.value)}
                          />
                        </label>
                        <label>
                          Approved recipient
                          <input
                            placeholder="0x…"
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                          />
                        </label>
                        <button
                          className="primary"
                          disabled={!wallet.isConnected || busy}
                          onClick={() => void transact('grant')}
                        >
                          Grant 24-hour mandate <ArrowUpRight size={16} />
                        </button>
                        <p className="footnote">
                          Fund the account separately. Limits use six-decimal
                          token units. Only the account owner can grant
                          authority.
                        </p>
                      </>
                    )}
                  </section>
                </div>
                {tab === 'preview' ? (
                  <section className="panel activity">
                    <div className="panel-heading">
                      <Activity size={18} />
                      <h3>Operation receipts</h3>
                      <span>{receipts.length.toString().padStart(2, '0')}</span>
                    </div>
                    <div className="table-head">
                      <span>OPERATION</span>
                      <span>OUTCOME</span>
                      <span>SPENT</span>
                    </div>
                    {receipts.length ? (
                      receipts.map((r) => (
                        <div className="receipt" key={r.id}>
                          <div>
                            <strong>{r.action}</strong>
                            <p>{r.detail}</p>
                          </div>
                          <span
                            className={`status ${r.status === 'Blocked' ? 'blocked' : r.status === 'Delivery failed' ? 'warning' : ''}`}
                          >
                            {r.status === 'Blocked' ? (
                              <X size={13} />
                            ) : (
                              <Check size={13} />
                            )}{' '}
                            {r.status}
                          </span>
                          <span>{r.amount} USDC</span>
                        </div>
                      ))
                    ) : (
                      <div className="empty">
                        <Activity size={24} />
                        <p>Run a request to inspect its outcome.</p>
                        <span>
                          Payments and service delivery are tracked separately.
                        </span>
                      </div>
                    )}
                  </section>
                ) : (
                  <output className="transaction-message">
                    {message ||
                      'Connect a wallet and enter a deployment address to begin.'}
                  </output>
                )}
              </>
            )}
            <footer>
              Wayleave / Developer tools{' '}
              <span>Factory + ownership registry + bounded execution</span>
            </footer>
          </section>
        </div>
        <Dialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen}>
          <DialogContent className="wallet-dialog">
            <DialogHeader>
              <span className="dialog-icon">
                <Wallet size={19} />
              </span>
              <DialogTitle>Connect the owner wallet</DialogTitle>
              <DialogDescription>
                Your wallet proves ownership. Connecting and signing in never
                gives Mandate access to your funds.
              </DialogDescription>
            </DialogHeader>
            <div className="wallet-scope">
              <span>
                <ShieldCheck size={15} /> No token approval
              </span>
              <span>
                <KeyRound size={15} /> No spending permission
              </span>
            </div>
            <button
              className="wallet-option"
              onClick={connectWallet}
              disabled={connect.isPending}
            >
              <span>
                <Wallet size={18} />
              </span>
              <div>
                <strong>Browser wallet</strong>
                <small>MetaMask, Rabby, or another injected wallet</small>
              </div>
              <ChevronRight size={16} />
            </button>
            {walletError && (
              <p className="wallet-error" role="alert">
                {walletError}
              </p>
            )}
            <a
              className="wallet-help"
              href="https://ethereum.org/en/wallets/find-wallet/"
              target="_blank"
              rel="noreferrer"
            >
              What is a wallet? <ExternalLink size={13} />
            </a>
          </DialogContent>
        </Dialog>
      </div>
    </AppFrame>
  );
}
