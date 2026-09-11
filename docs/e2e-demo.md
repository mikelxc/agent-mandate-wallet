# Owner-approved cross-chain payment demo

The current route is Arc Testnet to Ethereum Sepolia. No NFAT deployment is needed on the destination chain: Circle's existing MessageTransmitter mints native test USDC to the reviewed recipient. x402 is an optional paid-API protocol and is not part of this implementation.

## Demonstration sequence

1. Resolve an ENSv2 identity on the dedicated hackathon Sepolia deployment, verify its controller, enroll an agent authentication key, and associate the Arc payment account with separate proof from its NFAT owner.
2. From an MCP client, inspect live indexed Sepolia payment history and explain the evidence before proposing another payment. The existing subgraph indexes the original demo token; that token is distinct from Circle's Sepolia USDC. Missing Arc history is not evidence of zero spending.
3. Propose a small exact Arc USDC payment to a reviewed recipient on Ethereum Sepolia. Show the source debit, maximum Circle fee, minimum destination amount, account, owner, destination and reference.
4. The owner sets the capped allowance and funds any missing EntryPoint gas deposit, then signs the reviewed UserOperation. The owner wallet submits `handleOps` directly; no external bundler is required.
5. The Arc NFAT's Kernel account executes one atomic batch: pull the approved owner funds, set exact Circle allowance, call CCTP `depositForBurn`, and clear the allowance. Show the successful inner UserOperation and matching Circle message, not merely a successful outer transaction.
6. Poll Circle for the matching attestation. Switch to Sepolia, submit `receiveMessage`, and verify the destination receipt, nonce consumption, recipient and minted USDC amount. Refresh the page to demonstrate durable recovery without another burn.
7. Ask the agent to explain the outcome, keeping payment settlement distinct from service delivery. If demonstrating an actual paid service, show its separately recorded response or delivery evidence. Rotate or revoke the ENS agent key and show that its old session loses access without changing historical payment evidence.

## Evidence to record

Record public source and destination transaction hashes, the correlated Circle message/nonce, before/after recipient balance, and the MCP explanations. Record actual ENS enrollment and revocation transactions. Keep keys, bearer tokens and provider credentials out of the recording and repository.

The deployed Arc contracts and read-only route checks are verified. A real CCTP transfer and the live portable ENS enrollment/revocation sequence remain to be demonstrated; local fixtures and deployed addresses alone do not establish those outcomes.
