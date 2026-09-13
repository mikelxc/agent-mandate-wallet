'use client';
import { useState } from 'react';
import { PortableIdentityPanel } from './portable-identity';
type Progress = { identity: boolean; account: boolean; agent: boolean };
/** Shared by onboarding and the standalone access page. */
export function AgentAccessFlow({
  initialName,
  initialAccount,
  restoreExisting = false,
  onProgress,
  onBusyChange,
}: {
  onBusyChange?: (busy: boolean) => void;
  initialName?: string;
  initialAccount?: string;
  restoreExisting?: boolean;
  onProgress?: (progress: Progress) => void;
}) {
  const [progress, setProgress] = useState<Progress>({
    identity: false,
    account: false,
    agent: false,
  });
  const stage = !progress.identity
    ? 'identity'
    : !progress.account
      ? 'account'
      : 'agent';
  return (
    <div className="arc-identity-form agent-access-flow">
      <div
        className="connection-preparation"
        hidden={restoreExisting && !!initialName && !!initialAccount}
      >
        <span>
          {stage === 'identity'
            ? '1 · Verify your identity'
            : stage === 'account'
              ? '2 · Confirm your Arc account'
              : '3 · Grant access and connect your client'}
        </span>
        <p>
          {stage === 'identity'
            ? 'Verify the name associated with your wallet to create a named connection.'
            : stage === 'account'
              ? 'Confirm the account this connection can access. Payments still require your approval.'
              : 'Choose permissions and duration, then use the signed connection in your client.'}
        </p>
      </div>
      <PortableIdentityPanel
        initialName={initialName}
        initialAccount={initialAccount}
        connectionOnly={restoreExisting}
        onBusyChange={onBusyChange}
        hideWalletCreation
        hideIdentityHeading
        stage={stage}
        onProgress={(next) => {
          setProgress(next);
          onProgress?.(next);
        }}
      />
    </div>
  );
}
