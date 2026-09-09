import { WorkspaceShell } from '../../components/workspace-shell';
import { AgentControl } from '../../components/agent-control';
import { KernelWorkspace } from '../../components/kernel-workspace';
import AccountAccess from '../../components/account-access';

export default function Accounts() {
  return (
    <WorkspaceShell active="accounts">
      <div className="wl-page-heading">
        <p className="wl-eyebrow">ACCOUNT ACCESS</p>
        <h1>Ready when you are.</h1>
        <p>
          Set up your account, connect an agent, and review real payment
          requests.
        </p>
      </div>
      <AccountAccess />
      <section
        className="wl-existing-access"
        aria-label="Connected wallet and agent access"
      >
        <h2>Use your connected wallet</h2>
        <AgentControl />
      </section>
      <details className="wl-account-settings">
        <summary>Account funding &amp; settings</summary>
        <KernelWorkspace />
      </details>
    </WorkspaceShell>
  );
}
