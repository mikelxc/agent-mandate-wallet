import { createAgentTokens } from './agent-tokens';
import { createCompatibleAgentAuth } from './agent-auth';
import { createPublicClient, http, type Address } from 'viem';
import { arcTestnet } from 'viem/chains';
import type { Store } from './store';
import type { Chain } from './chain';
import { historyFromEnv } from './history';
import { createIdentityResolver } from './identity-resolver';
import { createIdentityAuth, createIdentityRoutes } from './identity-auth';
import { createIdentityAssociations } from './identity-associations';
import { arcDeploymentFromEnv, liveArcChain } from './arc-chain';
import { createCctpRoute } from './cctp';
import { createMerchantRoute } from './merchant';
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
    const tokens = createAgentTokens(store, auth, associations, audience);
    const authenticate = createCompatibleAgentAuth(store, chain, tokens.authenticate);
    return {
        history: historyFromEnv(),
        authenticateScopedAgent: (request: Request) => authenticate(request, 11155111),
        routes: [
            async (request: Request) => {
                if (new URL(request.url).pathname !== '/agent/account' || request.method !== 'GET') return null;
                const agent = await authenticate(request);
                if (!agent) return Response.json({ error: 'Invalid, expired or revoked bearer token' }, { status: 401 });
                return Response.json({ agent, chainId: agent.chainId, permissions: agent.scopes,
                    ...(agent.chainId === 11155111 ? { balances: await chain.balances(agent.account, agent.owner) } : {}),
                    mode: 'owner_approval_required',
                }, { headers: { 'Cache-Control': 'no-store' } });
            },
            createMerchantRoute({ store, audience: dashboardOrigin, chain: arc, authenticateAgent: request => authenticate(request, 5042002) as Promise<{ id: string; account: Address; owner: Address } | null> }),
            createIdentityRoutes(auth, dashboardOrigin, associations, tokens),
            createCctpRoute({ store, audience: dashboardOrigin, chain: arc, deployment,
                authenticateAgent: async (request) => {
                    const agent = await authenticate(request, 5042002);
                    return agent ? { id: agent.id, account: agent.account as Address, owner: agent.owner as Address } : null;
                },
            }),
        ],
    };
}
