# Wayleave account flow

The main product is the human control panel for real accounts and requests. The
previous persistent simulated job workspace has been removed from the home route.
`/` and `/accounts` both preserve the original mobile account interface.

## Guided setup

1. Choose an injected or WalletConnect wallet in AppKit, then explicitly verify
   ownership with a login signature. Closing the picker never authenticates.
2. Select the existing approval-only policy: read and propose, with an exact owner
   signature for every payment. This does not deploy an autonomous policy module.
3. Create the NFAT and its ENS name in one real Sepolia transaction. This is the
   first test transaction: only testnet gas, no invented name fee or token approval.
4. Only after the NFAT exists, choose an MCP client.
5. Select the NFAT that client will access.
6. Issue a separate revocable credential for each client and copy a configuration
   containing an explicit absolute checkout path. The client can be switched here
   without changing or reminting the NFAT.
7. Read the live validator binding, registry account and NFT owner, then compare
   the account with `get_account` in the MCP client. Never infer a connection from
   copied configuration. Additional clients get separate revocable credentials.

Setup can be skipped or reopened. Only the dismissal preference is saved locally;
there are no persistent sample payments, balances or pretend completed jobs.
Funding and capped allowances remain in account settings. A token allowance and
an agent's proposal access are separate from the owner's execution signature.
No new onchain permission or unrestricted signing is introduced by this UI.

## Mobbin references

Reviewed the returned screen images for these references. Adopt the interaction
patterns, not their branding or exact layout:

- [Wise payment review](https://mobbin.com/screens/ced7c24f-5381-4d74-8c7c-313b54f94540):
  compact progress indicator, prominent amount, summary rows and one confirmation.
- [PayPal payment review](https://mobbin.com/screens/34fbf5fd-4c50-4dcf-a26b-42bdd53f00e7):
  payment detail disclosure and an explicit final total before sending.
- [Contractbook task creation](https://mobbin.com/flows/c231b486-f673-4c7b-bcf0-57f21cbf8bab):
  contextual task details and a clear confirmation without losing the workspace.
- [Height task form](https://mobbin.com/flows/186edfeb-8a25-45ca-b624-917f5439de90):
  focused form entry and task detail with adjacent activity.

## E2E boundaries

Browser checks cover wallet-first entry on mobile and desktop, dismissal across
reload, reopening, client-specific MCP configuration, policy explanation,
transaction gating without a wallet, real WalletConnect QR display and cancellation
on mobile/desktop, and NFT verification without fabricated
success. These checks do not sign or submit transactions.

Live owner signing, ENS creation, MCP readback and sponsor integration execution
remain separate end-to-end checks. Circle/Arc and Ledger are not represented as
live based on this onboarding change.
