import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import '../app/workspace.css';

export function WorkspaceShell({
  children,
  active,
}: {
  children: ReactNode;
  active: 'job' | 'accounts';
}) {
  return (
    <div className="wl-shell">
      <a className="wl-skip" href="#workspace-main">
        Skip to workspace
      </a>
      <header className="wl-header">
        <a className="wl-brand" href="/" aria-label="Wayleave home">
          <span className="wl-brand-mark" aria-hidden="true">
            <ArrowUpRight size={19} />
          </span>
          wayleave<span className="wl-environment">Test workspace</span>
        </a>
        <nav className="wl-header-links" aria-label="Main navigation">
          <a href="/" aria-current={active === 'job' ? 'page' : undefined}>
            Workspace
          </a>
          <a
            href="/accounts"
            aria-current={active === 'accounts' ? 'page' : undefined}
          >
            Accounts
          </a>
        </nav>
      </header>
      <main className="wl-workspace" id="workspace-main">
        {children}
      </main>
      <footer className="wl-footer">
        <span>Human authority. Agent execution.</span>
        <a href="/advanced">
          Developer tools <ArrowUpRight size={13} />
        </a>
      </footer>
    </div>
  );
}
