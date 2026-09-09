import { WorkspaceShell } from '../components/workspace-shell';
import JobWorkspace from '../components/job-workspace';

export default function Home() {
  return (
    <WorkspaceShell active="job">
      <JobWorkspace />
    </WorkspaceShell>
  );
}
