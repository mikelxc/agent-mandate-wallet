/** Embed only explicitly selected public project files. Never traverses the workspace or reads env files. */
import { createHash } from 'node:crypto';
const paths = ['docs/architecture.md', 'docs/arc-circle.md', 'packages/contracts/src/NFTOwnerValidator.sol', 'deployments/arc-testnet.json', 'deployments/cctp-route-ethereum-sepolia.json'];
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const files = await Promise.all(paths.map(async name => {
  const content = await Bun.file(new URL(`../${name}`, import.meta.url)).text();
  return { name, mediaType: name.endsWith('.json') ? 'application/json' : 'text/plain', content, sha256: digest(content) };
}));
const content = 'service,requests,unit_price_usdc\nresearch,12,0.10\ncompute,8,0.25\nstorage,5,0.05\n';
files.push({ name: 'examples/service-usage.csv', mediaType: 'text/csv', content, sha256: digest(content) });
const readme = 'Wayleave Developer Pack v1\n\nA public-source snapshot for an end-to-end TEST-USDC purchase. The repository remains freely accessible. Read docs/architecture.md, examine the validator source, and summarize examples/service-usage.csv. Deployment manifests are historical evidence, not proof of a completed purchase. CSV rows are example data.\n';
files.unshift({ name: 'README.txt', mediaType: 'text/plain', content: readme, sha256: digest(readme) });
await Bun.write(new URL('../apps/gateway/src/developer-pack.json', import.meta.url), JSON.stringify({ version: '1.0.0', sha256: digest(JSON.stringify(files)), files }, null, 2) + '\n');
