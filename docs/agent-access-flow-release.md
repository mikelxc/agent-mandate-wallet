# Shared agent access flow — September 13, 2026

`/connect` is the canonical page for granting access to an existing agent. `/agents/new` redirects there. The page and onboarding step 5 both render `AgentAccessFlow`, which uses the same identity verification, account confirmation, token grant and client setup components.

Returning owners can restore a valid identity session, select an already-linked Arc account and confirm it without repeating the association signature. The gateway still revalidates ownership when issuing access. New associations retain their separate controller proof. The selected account stays fixed during the grant; after signing, connection settings lock and collapse and client setup becomes visible.

UI wording uses “Grant agent access” for the action, “Agent access” in navigation and “Sign and grant access” for the authorization. “Connection” means a permission grant to an agent, not a newly created agent or wallet. Spending and Payments actions point to `/connect`. The Spending action has aligned text/icon spacing and a compact mobile layout.

Validation: frontend TypeScript; two canonical-route/responsive tests at 320 and 1280 pixels; a complete shared-flow regression through verification, association, grant, locked settings and linked-account restoration; two visual/dimension checks for the Spending action using the real component in a local-only harness. Gateway responses in browser tests are intercepted and use disposable wallets, so they do not establish user-wallet signing or public-chain payment evidence. The local layout harness is excluded from deployment.

The isolated release preserves committed base `56a2e98`, the prior identity/button/step-5 fixes and the changes above. Other workspace edits, including wallet management work and unrelated Spending landing copy, are excluded.

Production deployment `dpl_CZubd6JLfMQK3VrXWpGPDRocWJ4Z` is Ready and aliased to https://www.wayleave.xyz. Vercel build and TypeScript passed. All three canonical-route/shared-flow browser regressions passed again against the deployed frontend with intercepted test gateway responses. Inspection: https://vercel.com/lxc-xyz/wayleave/CZubd6JLfMQK3VrXWpGPDRocWJ4Z.

## Owned-wallet entry points

The access page now connects the owner wallet first and discovers current ownership NFTs on Sepolia and Arc using the existing verified inventory reader. Sepolia labels prefill the ENS picker and identity field. A uniquely matching owned Arc label is an account suggestion; the identity and account proof checks remain unchanged. Wallet settings offer “Grant agent access” with the selected chain/account in the URL. The access page independently rediscovers ownership before accepting that URL selection and rejects unverified selections.

A selected ENS identity cannot be replaced by a saved session for another name, and a selected Arc account cannot be overwritten by a previously linked account. The browser regression covers autofill, signed access, Accounts navigation, reuse of the link, and rejection of an unowned URL. Six ownership discovery unit tests and frontend TypeScript passed. Browser evidence uses mocked RPC reads and disposable signatures, not public-chain transactions.

Published as `dpl_DsJB8qHteS3Fcm1C7nLv4EekicWJ` (Ready), aliased to https://www.wayleave.xyz. Vercel production build and TypeScript passed. All three updated browser checks passed against the deployed frontend, including mobile overflow, prefilled ENS, the exact Accounts shortcut, restored association and unowned-link rejection. RPC and gateway responses in these checks remain test fixtures.
