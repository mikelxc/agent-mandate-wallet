import { AppFrame } from '../../components/app-frame';
import { AgentControl } from '../../components/agent-control';

export default function Connect() {
  return (
    <AppFrame active="connect">
      <AgentControl connectionsOnly />
    </AppFrame>
  );
}
