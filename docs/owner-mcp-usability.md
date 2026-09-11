# Owner and MCP usability review — September 10, 2026

## Design direction

Reviewed Mobbin's [Mercury payment review](https://mobbin.com/screens/10c550ab-f499-4dbf-8bc2-d007a42c9e00) and [Coinbase wallet connection](https://mobbin.com/flows/72bba0bd-7466-49fd-9f7c-acfeec6c8c09). Applied their focused task hierarchy: one primary action, amount before details, restrained borders, generous spacing and progressively disclosed setup. Replaced the green palette and promotional panels with white, charcoal and a muted purple action color. These are inspiration references, not copied assets.

The entry screen explains the actual interaction. An owner connects, creates or selects a spending wallet, then links an agent. A direct payment link opens that request alone. Wallet access shows balance, remaining allowance and network-fee deposit. Advanced contract controls remain separately accessible.

## Real Sepolia run

The browser used the existing encrypted E2E test keystore through the loopback-only signer. No private key was sent to the browser. A separate GPT-5.6 Luna agent exercised the local MCP server over stdio.

- Owner: `0x96B0D15128748cE191B79c75560Ed93695788865`
- Created wallet: `0xE4A1B73f7Bd68c6f90f8508295515A590921aA3A`, current registry NFT #3, label `owner-review-0911`.
- MCP operation: `91be9639-33a0-42c5-865d-8198d6bceb0b`.
- Payment: 1 demo USDC to `0x000000000000000000000000000000000000bEEF`.
- [Exact token allowance transaction](https://sepolia.etherscan.io/tx/0xa3f6cf0ce880736523bef7d9c2fa475913c56bb0c6fbdea1920dd8ca1443200c).
- [Payment transaction](https://sepolia.etherscan.io/tx/0xd92c635f38601d9b298ac2eeac192fe333e7b9be56894235d327d2977f78678f), block 11678757; gateway execution receipt reports success.
- Browser and MCP agreed: owner balance fell from 391 to 390 demo USDC; exact allowance was consumed, leaving zero. Refreshed browser gas deposit: 0.002599641500956572 Sepolia ETH.
- Both temporary local agent connections were revoked. A subsequent MCP `get_account` returned 401 Unauthorized. The temporary credential file and copied configuration were removed. The preview was restarted without the test signer.

Inclusion is evidence of payment execution, not service delivery or finality.

## Friction found and fixed

- The installed MCP connection belonged to a different owner. The retest used a separately scoped local credential for the actual browser wallet. The unrelated initial proposal was left unsigned.
- The gateway assumed port 3000, breaking login from the user's port 3020. Added an explicit, validated local dashboard origin setting.
- Owner login needed a narrowly validated E2E login-signature path. Added exact origin, owner, chain, statement, nonce and timestamp checks.
- Fee estimates changed between review and submission, repeatedly restarting setup. The displayed deposit now includes a disclosed 20% reserve, and reuses that exact reviewed amount only when it still covers the new requirement. Higher requirements need another review.
- Guided payment signing now registers the complete operation with the restricted test signer.
- MCP responses now explain token amounts, missing setup and successful/failed execution in readable terms while retaining original fields.
- A stale balance response could overwrite a newer wallet-specific read. Only the latest balance request can update the screen.
- Removed repeated setup panels, decorative onboarding sections and duplicate payment-success notifications.

## Verification and remaining boundaries

Production web build and all workspace type checks passed. The focused gateway, MCP, signer and payment-setup suite passed 67 tests. The Anvil smoke run passed account creation, funding, payment, replay rejection and ownership-handover checks.

This is a local implementation and test, not a production deployment or npm release. The browser payment used the test signer; the normal WalletConnect picker and a real pairing QR code were verified in the browser, but physical mobile WalletConnect signing was not exercised. Embedded ChatGPT/Claude UI and automatic terminal pairing are still unimplemented. The current MCP handoff needs host configuration, so the complete experience is not yet one uninterrupted conversation.
