import { AgentControl } from '../components/agent-control';
import { KernelWorkspace } from '../components/kernel-workspace';
import './account-home.css';

export default function Home() {
  return (
    <main className="account-home">
      <AgentControl />
      <details className="account-tools">
        <summary>Account funding &amp; settings</summary>
        <KernelWorkspace />
      </details>
      <a className="account-tools" href="/advanced">
        Developer tools
      </a>
    </main>
  );
}
