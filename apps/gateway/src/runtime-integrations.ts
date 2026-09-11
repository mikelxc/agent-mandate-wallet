import { createPublicClient, http, isAddress, type Address } from 'viem';
import { arcTestnet } from 'viem/chains';
import type { Store, Agent } from './store';
import type { Chain } from './chain';
import { historyFromEnv } from './history';
import { createIdentityResolver } from './identity-resolver';
import { createIdentityAuth, createIdentityRoutes } from './identity-auth';
import { createIdentityAssociations } from './identity-associations';
import { arcDeploymentFromEnv, liveArcChain } from './arc-chain';
import { createCctpRoute } from './cctp';
/** Identity discovery works before an account or payment integration is attached. */
export function runtimeIntegrations(store: Store, chain: Chain, audience: string, dashboardOrigin = audience) {
    const deployment = arcDeploymentFromEnv();
    const arc = deployment ? liveArcChain(deployment) : undefined;
    const arcRpc = createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL) });
    const resolver = createIdentityResolver(process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com');
    const auth = createIdentityAuth({ db: store.db, resolver, audience });
    const associations = createIdentityAssociations(store.db, auth, {
        async ownership(chainId, account) {
            const state = chainId === 11155111 ? await chain.ownership(account)
                : chainId === 5042002 && arc ? await arc.ownership(account) : null;
            if (!state)
                throw new Error('Payment chain is not configured');
            return { controller: state.owner as Address, epoch: state.epoch };
        },
        async verify(chainId, controller, message, signature) {
            if (chainId === 11155111)
                return chain.verifyLogin(controller, message, signature);
            if (chainId === 5042002 && arc)
                return arcRpc.verifyMessage({ address: controller, message, signature });
            return false;
        },
    });
    const authenticate = createPortableAgentAuthentication(store, associations);
    return {
        history: historyFromEnv(),
        authenticatePortableAgent: (request: Request) => authenticate(request, 11155111),
        routes: [
            createIdentityRoutes(auth, dashboardOrigin, associations),
            createCctpRoute({ store, audience: dashboardOrigin, chain: arc, deployment,
                authenticateAgent: async (request) => {
                    const agent = await authenticate(request, 5042002);
                    return agent ? { id: agent.id, account: agent.account as Address, owner: agent.owner as Address } : null;
                },
            }),
        ],
    };
}
export function createPortableAgentAuthentication(store: Store, associations: ReturnType<typeof createIdentityAssociations>) {
    return async function authenticate(request: Request, chainId: number) {
        const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
        const selected = request.headers.get('x-wayleave-account');
        if (!token || (selected && !isAddress(selected)))
            return null;
        try {
            if (!(await store.takeRateLimit('portable-auth', Math.floor(Date.now() / 1000), 600)))
                return null;
            const resolved = await associations.resolveAgent(token, chainId, selected ? selected as Address : undefined);
            const scope = request.method === 'GET' ? 'read' : 'propose_payment';
            if (!resolved.scopes.includes(scope))
                return null;
            const now = Math.floor(Date.now() / 1000);
            // An unguessable bearer is never persisted as a legacy connection. Keep a
            // non-token reference for the operations/audit foreign keys and local revocation.
            await store.db.query('INSERT OR IGNORE INTO agents (id,name,owner,account,tokenHash,expiresAt,revokedAt,createdAt) VALUES (?,?,?,?,?,?,NULL,?)')
                .run(resolved.id, resolved.name, resolved.owner.toLowerCase(), resolved.account.toLowerCase(), `identity:${resolved.id}`, resolved.expiresAt, now);
            await store.db.query('UPDATE agents SET expiresAt=? WHERE id=? AND revokedAt IS NULL').run(resolved.expiresAt, resolved.id);
            const row = await store.db.query('SELECT revokedAt,createdAt FROM agents WHERE id=?').get(resolved.id) as {
                revokedAt: number | null;
                createdAt: number;
            };
            if (row.revokedAt !== null)
                return null;
            const agent: Agent & {
                scopes: string[];
            } = { ...resolved, owner: resolved.owner.toLowerCase(), account: resolved.account.toLowerCase(), revokedAt: null, createdAt: row.createdAt };
            return agent;
        }
        catch {
            return null;
        }
    };
}
