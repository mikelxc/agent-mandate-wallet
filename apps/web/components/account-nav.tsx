'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, LogOut } from 'lucide-react';
import { ensV2HackathonDeployment } from '@mandate/sdk';
import { useConnection, usePublicClient } from 'wagmi';

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type OwnerSession = { address: string; chainId: number } | null;

/** Wallet identity and owner-session controls shared by every app section. */
export function AccountNav() {
  const { address } = useConnection();
  const client = usePublicClient({
    chainId: ensV2HackathonDeployment.chainId,
  });
  const [reverseName, setReverseName] = useState<{
    address: string;
    name: string;
  }>();
  const [ownerSession, setOwnerSession] = useState<OwnerSession>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!address || !client) {
      return;
    }
    let cancelled = false;
    void client
      .getEnsName({ address })
      .then((name) => {
        if (!cancelled && name) setReverseName({ address, name });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, client]);

  useEffect(() => {
    if (!address) {
      return;
    }
    const connectedAddress = address;
    let cancelled = false;
    void fetch('/gateway/auth/session', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as Exclude<OwnerSession, null>;
      })
      .then((session) => {
        if (
          !cancelled &&
          session?.chainId === ensV2HackathonDeployment.chainId &&
          session.address.toLowerCase() === connectedAddress.toLowerCase()
        )
          setOwnerSession(session);
      })
      .catch(() => {});
    function sessionChanged(event: Event) {
      const session = (event as CustomEvent<OwnerSession>).detail;
      setOwnerSession(
        session &&
          session.address.toLowerCase() === connectedAddress.toLowerCase()
          ? session
          : null,
      );
    }
    window.addEventListener('wayleave:owner-session', sessionChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('wayleave:owner-session', sessionChanged);
    };
  }, [address]);

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      if (
        menuRef.current?.open &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      )
        menuRef.current.removeAttribute('open');
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') menuRef.current?.removeAttribute('open');
    }
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const signedIn =
    !!address &&
    ownerSession?.chainId === ensV2HackathonDeployment.chainId &&
    ownerSession.address.toLowerCase() === address.toLowerCase();
  if (!address || !signedIn) return null;
  const connectedAddress = address;
  const resolvedReverseName =
    reverseName?.address.toLowerCase() === connectedAddress.toLowerCase()
      ? reverseName.name
      : undefined;

  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch('/gateway/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Could not sign out.');
      setOwnerSession(null);
      window.dispatchEvent(
        new CustomEvent<OwnerSession>('wayleave:owner-session', { detail: null }),
      );
    } finally {
      setSigningOut(false);
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(connectedAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <details className="account-nav" ref={menuRef}>
      <summary aria-label="Connected wallet menu">
        <span className="account-nav-identity">
          <span className="account-nav-label">Connected wallet</span>
          {resolvedReverseName && (
            <span className="account-nav-ens">{resolvedReverseName}</span>
          )}
          <span title={connectedAddress}>{shortAddress(connectedAddress)}</span>
        </span>
        <ChevronDown className="account-nav-chevron" size={14} />
      </summary>
      <div className="account-nav-menu">
        <span className="account-nav-menu-title">Connected wallet</span>
        <div className="account-nav-menu-identity">
          {resolvedReverseName && <strong>{resolvedReverseName}</strong>}
          <code>{connectedAddress}</code>
        </div>
        <button type="button" onClick={() => void copyAddress()}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied address' : 'Copy address'}
        </button>
        {signedIn && (
          <button
            className="account-nav-signout"
            type="button"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            <LogOut size={14} /> {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        )}
      </div>
    </details>
  );
}
