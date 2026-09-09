import { createServer } from 'node:http';
import next from 'next';
import { createDevWalletHandler } from './dev-wallet-server';

// Only the explicit local E2E command uses this launcher. Production uses
// `next build` / `next start`, which never import the test signer.
if (process.env.NODE_ENV !== 'development' || process.env.VERCEL) {
  throw new Error(
    'The test-wallet launcher is restricted to local development.',
  );
}

const hostname = '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}
const wallet = createDevWalletHandler(
  process.env.MANDATE_DEV_WALLET === 'true',
);
const app = next({ dev: true, hostname, port });
await app.prepare();
const handle = app.getRequestHandler();
const upgrade = app.getUpgradeHandler();

const server = createServer(async (req, res) => {
  try {
    if (wallet && req.url?.split('?')[0] === '/__mandate_dev_wallet') {
      await wallet(req, res);
      return;
    }
    await handle(req, res);
  } catch (error) {
    console.error('Local development request failed:', error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.on('upgrade', (req, socket, head) => {
  void upgrade(req, socket, head);
});
server.listen(port, hostname, () => {
  console.log(`Wayleave local test wallet: http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  server.closeAllConnections();
  await app.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
