'use client';

import { PortableMcpSetup } from './portable-mcp-setup';
import { AgentTokenManager } from './agent-token-manager';
import { gatewayResponse } from '../lib/gateway-response';

import { useEffect, useRef, useState } from 'react';
import { ArcWalletSetup } from './arc-wallet-setup';
import {
  useConnection,
  useConnect,
  useConnectors,
  useSignMessage,
  useSwitchChain,
} from 'wagmi';
import {
  portableIdentityDeployment,
  identityProofMessage,
  type PortableIdentity,
  type IdentityProof,
} from '@mandate/sdk';
import Link from 'next/link';
import {
  Fingerprint,
  ArrowDown,
  Link2,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import './agent-flows.css';
import { isAddress, type Address, type Hex } from 'viem';

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/gateway/identity/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return gatewayResponse<T>(response);
}
type IdentityPanelProps = {
  gatewayAudience?: string;
  stage?: 'identity' | 'account' | 'agent';
  onProgress?: (progress: {
    identity: boolean;
    account: boolean;
    agent: boolean;
  }) => void;
};
export function PortableIdentityPanel(props: IdentityPanelProps) {
  const { address } = useConnection();
  return <IdentityPanel key={address ?? 'disconnected'} {...props} />;
}
function IdentityPanel({
  gatewayAudience,
  stage,
  onProgress,
}: {
  gatewayAudience?: string;
  stage?: 'identity' | 'account' | 'agent';
  onProgress?: (progress: {
    identity: boolean;
    account: boolean;
    agent: boolean;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState<PortableIdentity>();
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentAccount, setPaymentAccount] = useState('');
  const paymentChain = 5042002;
  const [association, setAssociation] = useState('');
  const switchChain = useSwitchChain();
  const [tokenReady, setTokenReady] = useState(false);
  const { address, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const sign = useSignMessage();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const callback = useRef(onProgress);
  callback.current = onProgress;
  const currentAddress = useRef(address);
  currentAddress.current = address;
  useEffect(() => {
    setVerified(false);
    setIdentity(undefined);
    setAssociation('');
    setTokenReady(false);
    setPaymentAccount('');
    callback.current?.({ identity: false, account: false, agent: false });
  }, [address]);
  useEffect(() => {
    if (mounted.current)
      callback.current?.({
        identity: verified,
        account: verified && !!association,
        agent: verified && tokenReady,
      });
  }, [verified, association, tokenReady]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Identity request failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="wl-agent-settings identity-flow"
      data-onboarding-stage={stage}
    >
      {!stage && (
        <div className="flow-heading">
          <span className="flow-eyebrow">Name &amp; access</span>
          <h1>
            A familiar name.
            <br />
            Wherever your agent works.
          </h1>
          <p>
            Bring your ENS name to Wayleave. Connect an agent wallet when you’re
            ready, and decide which connections can read or request payments.
          </p>
        </div>
      )}
      <div className="flow-layout">
        <div className="flow-main">
          <div className="flow-surface">
            <div hidden={!!stage && stage !== 'identity'}>
              <div className="flow-section-heading">
                <span className="flow-symbol">
                  <Fingerprint size={22} />
                </span>
                <div>
                  <h2>Use a name you own</h2>
                  <p>Look it up first. Verify it with your wallet next.</p>
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    setVerified(false);
                    setIdentity(undefined);
                    setAssociation('');
                    setTokenReady(false);
                    setIdentity(
                      await api<PortableIdentity>(
                        `discover?deployment=${portableIdentityDeployment}&name=${encodeURIComponent(name)}`,
                      ),
                    );
                  });
                }}
              >
                <label htmlFor="identity-name">ENS name</label>
                <input
                  id="identity-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setAssociation('');
                    setTokenReady(false);
                    setIdentity(undefined);
                    setVerified(false);
                  }}
                  placeholder="research-desk.wayleave.eth"
                  required
                />
                <p className="flow-note">
                  Testnet · Uses the ENSv2 Sepolia registry. Mainnet ENS names
                  aren’t supported here yet.
                </p>
                <button
                  className="primary"
                  disabled={busy || !name.trim()}
                  type="submit"
                >
                  {busy ? 'Looking up name…' : 'Look up name'}{' '}
                  <ArrowRight size={16} />
                </button>
              </form>
              <p className="flow-note">
                Need a name?{' '}
                <a
                  href="https://hackathon-deployment-manager-app-v4.ens-cf.workers.dev/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Register one in the ENS hackathon app
                </a>
                , then return here. Use a name your connected wallet controls.
              </p>
            </div>
            {!!stage && stage !== 'identity' && !verified && (
              <p role="status">
                Verify your ENS name in the identity step first.
              </p>
            )}
            {stage === 'agent' && !verified && (
              <PortableMcpSetup
                identity={identity?.name ?? '<your ENS identity>'}
                agentName={`<connection-label>.${identity?.name ?? '<your ENS identity>'}`}
                account=""
                gateway={gatewayAudience ?? 'https://www.wayleave.xyz/gateway'}
              />
            )}
            {error && (
              <p className="flow-message" role="alert">
                {error}
              </p>
            )}
            {identity && (
              <section
                aria-label="Discovered identity"
                className="identity-result"
              >
                <div hidden={!!stage && stage !== 'identity'}>
                  <span className="flow-eyebrow">
                    {verified ? 'Control verified' : 'Name found'}
                  </span>
                  <h2>{identity.name}</h2>
                  <details className="flow-disclosure">
                    <summary>Name details</summary>
                    <dl>
                      <dt>Controlling wallet</dt>
                      <dd style={{ overflowWrap: 'anywhere' }}>
                        {identity.controller}
                      </dd>
                      <dt>Expires</dt>
                      <dd>
                        {new Date(identity.expiresAt * 1000).toLocaleString()}
                      </dd>
                    </dl>
                  </details>
                  {!verified ? (
                    <>
                      <p>
                        Verify control to save this workspace. This signature
                        verifies ownership and does not move money.
                      </p>
                      {!address ? (
                        connectors.map((connector) => (
                          <button
                            key={connector.uid}
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await connect.mutateAsync({ connector });
                              })
                            }
                          >
                            Connect {connector.name}
                          </button>
                        ))
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const challenge = await api<{
                                proof: IdentityProof;
                                message: string;
                              }>('challenge', {
                                deployment: portableIdentityDeployment,
                                kind: 'owner',
                                name: identity.name,
                              });
                              if (
                                challenge.proof.audience !==
                                  (gatewayAudience ?? window.location.origin) ||
                                challenge.message !==
                                  identityProofMessage(challenge.proof)
                              )
                                throw new Error(
                                  'Gateway challenge does not match this site',
                                );
                              const signature = await sign.mutateAsync({
                                message: challenge.message,
                              });
                              await api('verify', {
                                nonce: challenge.proof.nonce,
                                signature,
                              });
                              setVerified(true);
                            })
                          }
                        >
                          Verify with your wallet
                        </button>
                      )}
                      <p>
                        Use the registry owner’s wallet. Smart-account owners
                        need a compatible contract-signature wallet.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="flow-message" role="status">
                        You control this name. Choose what to connect below, or
                        come back later.
                      </p>
                      <button
                        onClick={() =>
                          void run(async () => {
                            await api('logout', {});
                            setVerified(false);
                          })
                        }
                      >
                        Sign out of identity
                      </button>
                    </>
                  )}
                </div>
                {verified && (!stage || stage === 'account') && (
                  <details
                    open={stage === 'account'}
                    className="flow-disclosure"
                  >
                    <summary>Connect an Arc wallet</summary>
                    <h3>Keep the name. Choose the wallet.</h3>
                    <p>
                      Link a wallet you own to this name. You’ll sign a separate
                      ownership proof; payments still need your approval.
                    </p>
                    <ArcWalletSetup
                      onAccount={(account) => {
                        setPaymentAccount(account);
                        setAssociation('');
                      }}
                    />
                    <p className="flow-note">
                      Payment network: Arc Testnet. Arc Mainnet is coming soon.
                    </p>
                    <label>
                      Agent wallet address
                      <input
                        value={paymentAccount}
                        onChange={(e) => {
                          setPaymentAccount(e.target.value);
                          setAssociation('');
                        }}
                        placeholder="0x…"
                      />
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (!isAddress(paymentAccount))
                            throw new Error(
                              'Enter the payment smart-account address',
                            );
                          const challenge = await api<{
                            binding: {
                              nonce: string;
                              audience: string;
                              identity: string;
                              account: string;
                              chainId: number;
                              controller: string;
                              version: number;
                              deployment: string;
                              registration: string;
                              identityController: string;
                              expiresAt: number;
                            };
                            message: string;
                          }>('accounts/challenge', {
                            chainId: paymentChain,
                            account: paymentAccount,
                          });
                          if (
                            challenge.binding.audience !==
                              (gatewayAudience ?? window.location.origin) ||
                            challenge.binding.identity !== identity.name ||
                            challenge.binding.account.toLowerCase() !==
                              paymentAccount.toLowerCase() ||
                            challenge.binding.chainId !== paymentChain
                          )
                            throw new Error(
                              'Unexpected account association challenge',
                            );
                          if (
                            address?.toLowerCase() !==
                            challenge.binding.controller.toLowerCase()
                          )
                            throw new Error(
                              `Connect the payment account’s controller (${challenge.binding.controller}) to approve this association.`,
                            );
                          if (
                            challenge.binding.version !== 1 ||
                            challenge.binding.deployment !==
                              portableIdentityDeployment ||
                            challenge.binding.registration !==
                              identity.registration ||
                            challenge.binding.identityController.toLowerCase() !==
                              identity.controller.toLowerCase() ||
                            challenge.binding.expiresAt <= Date.now() / 1000 ||
                            challenge.message !==
                              `Wayleave account association v1\nAssociate this payment account with the named identity. This grants no spending authority.\n${JSON.stringify(challenge.binding)}`
                          )
                            throw new Error(
                              'Unexpected account association message',
                            );
                          if (chainId !== paymentChain)
                            await switchChain.mutateAsync({
                              chainId: paymentChain,
                            });
                          const signature = await sign.mutateAsync({
                            message: challenge.message,
                          });
                          await api('accounts/attach', {
                            nonce: challenge.binding.nonce,
                            signature,
                          });
                          setAssociation(
                            `Associated ${paymentAccount} on ${paymentChain === 5042002 ? 'Arc Testnet' : 'Sepolia'}.`,
                          );
                        })
                      }
                    >
                      Verify and link wallet
                    </button>
                    {association && <p role="status">{association}</p>}
                  </details>
                )}
                {verified && (
                  <div hidden={!!stage && stage !== 'agent'}>
                    <AgentTokenManager
                      audience={gatewayAudience}
                      identity={identity}
                      account={paymentAccount}
                      gateway={
                        gatewayAudience ?? 'https://www.wayleave.xyz/gateway'
                      }
                      onReady={setTokenReady}
                    />
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
        {!stage && (
          <aside className="flow-aside">
            <div
              className="identity-map"
              aria-label="A name can connect agent wallets and client access"
            >
              <span className="flow-symbol">
                <Fingerprint size={28} />
              </span>
              <strong>Your ENS name</strong>
              <span>A name you control</span>
              <ArrowDown size={20} aria-hidden="true" />
              <div className="identity-map-branches">
                <div>
                  <Wallet size={20} />
                  <strong>Agent wallets</strong>
                  <span>Owned by you</span>
                </div>
                <div>
                  <Link2 size={20} />
                  <strong>Connections</strong>
                  <span>Access you choose</span>
                </div>
              </div>
            </div>
            <h2>Start small. Add as you go.</h2>
            <p>
              A name is a starting point. You can link a wallet and configure
              access later, without handing an agent your signing key.
            </p>
            <Link className="flow-text-link" href="/connect">
              Just need to connect an agent? <ArrowRight size={14} />
            </Link>
          </aside>
        )}
      </div>
    </section>
  );
}
