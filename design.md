# Wayleave design direction

This document records the product and design decisions agreed during the September 2026 redesign. Use it to guide future pages, embedded agent interfaces, and terminal flows. It describes both the current experience and the intended direction; unfinished capabilities are identified below.

## The idea

Give agents spending ability without handing them your private key or creating more balances to manage.

Your existing wallet remains the source of funds. It holds an ownership NFT for each agent wallet. Each NFT controls a real wallet with its own address and onchain identity. An agent receives a scoped connection to that wallet; it does not receive ownership or your signing key.

The hierarchy should be visible:

```text
Your wallet
├── Your funds
├── Ownership NFT → Research agent wallet → Agent connection
├── Ownership NFT → Travel agent wallet   → Agent connection
└── Ownership NFT → Coding agent wallet   → Agent connection

Payment: your balance → agent wallet → recipient
```

Ownership and funding are different relationships. The NFT controls the agent wallet; approved payments draw from the owner's balance through that wallet. Explain this without implying that the NFT itself stores the funds or that the agent has unrestricted access.

The useful everyday model is one source of funds, identifiable agents, and one place to understand their spending. Avoid presenting every agent as another account the user must separately fund and maintain.

## The feeling

**Calm autonomy:** “My agents can do things for me, and this stays manageable.”

The experience should convey relief, clarity, and quiet confidence. Ownership is tangible, activity is understandable, and intervention is available when needed. Control should feel easy to exercise rather than like a complex administration task.

Our emotional references are:

- [Stoic](https://mobbin.com/apps/stoic-ios-621f0be7-8046-45cd-b667-97add5f9c3c7): restrained monochrome illustration, generous space, approachable typography, and a personal, considered character.
- [Waymo](https://mobbin.com/apps/waymo-ios-028a65c1-23a8-4fe1-bcf0-aab15ced5842): make autonomous activity legible through clear states, recognizable objects, and accessible controls.

Mercury, Linear, Family, Apple Home, and Things remain useful references for individual interactions and information hierarchy. Stoic and Waymo lead the emotional and visual direction. Borrow principles rather than reproducing their branding.

## Visual language

- **Palette:** mist gray (`#f3f4f4`), white surfaces, near-black text and primary controls (`#252a27`). Muted mineral tones support diagrams and states. Avoid the earlier prominent green treatment or a colorful financial dashboard.
- **Typography:** approachable sans serif with rounded character, strong readable headings, restrained labels, and clear payment amounts. The earlier oversized editorial serif direction is retired.
- **Surfaces:** a few generous, softly rounded groups; subtle depth; fine separators only where they clarify relationships. Prefer continuous layouts and rows over repeated boxes around every detail.
- **Composition:** desktop pairs a concise introduction with a concrete product illustration. Mobile follows a natural reading order. Space should improve comprehension rather than leave an empty slogan page.
- **Identity:** the rounded W and central dot suggest independent paths supported by one base. Carry its geometry through the favicon, install icons, social artwork, and simple monochrome agent symbols.
- **Hierarchy:** agent identity, ownership, spending, and connection details have distinct roles. Show the detail needed for the current decision; reveal technical information on demand.

The designer's touch comes from consistent proportions, original illustrations, careful spacing, and purposeful transitions. Additional decoration is not a substitute for showing how the product works.

## Language

Use short, direct language about what users own, what agents can do, and what happens next. Be warm without adding motivational filler or repeated slogans.

Approved examples:

- “Let your agents do their thing.”
- “Your keys stay yours. Your funds stay together.”
- “Agents spend from your wallet. No separate top-ups.”
- “Demo · See how a payment works.”

Call the onchain entity an **agent wallet**. Call the temporary app credential a **connection**, with an optional connection label. Do not make users distinguish an unexplained wallet name from a session name.

Avoid unnecessary technical banners such as “ENSv2 WALLET EXAMPLE,” lengthy fictional-data disclaimers, and agent balance figures that suggest users need to top up every wallet. Keep the demo clearly identified with a concise label. Real testnet status and payment evidence must remain visible and accurate.

## Landing page and demonstration

The landing page is one continuous introduction. Keep the brand visible and hide the workspace navigation links. “Get started” opens the guided setup without immediately launching wallet connection; a quieter “Sign in” action serves returning users. Include the agent connection guide on the same page; “Connect your favorite app” scrolls to it. Match the onboarding’s rounded buttons and muted icons, and keep the opening copy focused on ownership and owner-approved spending.

The illustration shows the parent wallet and its collection of agent ownership NFTs. Each agent example has an ENS subdomain, an NFT number, and a resolved wallet address. The hierarchy explains that an NFT represents ownership of a real agent wallet. Example identities are illustrative, not evidence of deployed ENS resolution.

Automatically cycle through the agents and four payment stages:

1. An agent's request arrives.
2. The owner approves in the demonstration.
3. Funds flow from the parent wallet through the agent wallet.
4. A transaction goes to the recipient.

Show the source and destination of the flow, not just changing numbers. Agent wallets do not need a displayed `$0.00` balance to explain shared funding. Do not imply a user must maintain separate token balances.

Provide play/pause, agent selection, and manual stage controls. Manual interaction pauses playback. Keep the receipt area stable as states change, and avoid announcing every autoplay change to screen readers.

## Setup and daily use

### Setup

1. **Connect:** use a browser wallet or WalletConnect QR code. Explain that signing in verifies ownership and does not move money.
2. **Understand access:** explain the funding wallet, ownership NFT, agent wallet, and scoped connection in plain language.
3. **Name the agent wallet:** provide room for the name and ENS suffix. Explain where the ownership NFT goes and how it controls the wallet.
4. **Link an app:** choose Codex, Claude, or Cursor, then create and copy the connection configuration. Use consistent host logos and aligned labels. Connection labels are optional; expiration is explicit.
5. **Continue:** show the created identity and a clear next action.

Keep workspace navigation hidden during initial setup. Show one primary action per step. Some wallet apps may require importing the NFT before displaying it; do not promise automatic visibility everywhere.

The setup is a working product flow with a walkthrough inside it. Keep wallet connection brief. Use a labeled five-step navigation so users can explore before signing in; visiting a step does not complete it. On desktop, pair the current action with a contextual ownership or connection diagram. On mobile, place the interactive explanation before its continue action.

“How it works” explores ownership, scoped access, and an owner-approved payment. Playback is optional, pauses on manual stage selection, and respects reduced motion. Only the illustrative payment uses an example label; the surrounding setup stays actionable. The wallet-name diagram previews the actual input and marks it as a preview until creation succeeds. The final checklist distinguishes verified ownership, a selected wallet, and a created connection; creating a credential is not evidence that an app installed it. Incomplete setup leads back to the missing action rather than claiming readiness.

### Payments and management

Pending requests and shared spending activity are the center of daily use. Identify the responsible agent on each payment. Let users inspect and revoke connections without making them navigate a maze of accounts.

Review emphasizes the amount, recipient, funding source, and required approval. Show the current preparation step; place technical details behind disclosure. Keep setup transactions, pending submission, and confirmed payment receipts distinct. Errors should explain what the user needs to do next.

Do not portray several wallet confirmations as a single atomic transaction unless the deployed execution path actually supports it.

## Motion and accessibility

Use brief transitions for navigation and changing content. Flow animations explain request arrival, funding direction, and payment submission. Avoid gratuitous looping motion outside the optional demo.

Honor reduced-motion preferences: start the demo paused and disable movement. Preserve manual access to every stage. Maintain visible keyboard focus, meaningful control names, readable contrast, and touch-friendly controls. Check narrow screens, long wallet names, address wrapping, and aligned agent choices.

## Current capability and future direction

Today, local MCP clients can read wallet information, propose payments, and follow operation status. Setup and owner approval happen on the website. The deployed experience uses Sepolia test funds and explicit owner approval.

The longer-term goal is to begin in a conversation and complete the flow within ChatGPT or Claude where supported, with a terminal experience when no UI is available. Embedded approvals and terminal QR pairing remain future work. WalletConnect is the current connection surface; this design does not require a custom communication protocol.

Never imply that visual examples establish live integrations, that approvals happen automatically outside the demo, or that an agent has unrestricted signing authority.

## Name and network flows

Identity and cross-chain settlement support the same everyday job: connect an identifiable agent and understand what it spends. They should not become separate integration dashboards.

- **Payments follows the Arc network.** Arc uses the Payments navigation at `/payments` and opens its request queue. A manual request is a secondary action. Review foregrounds the amount, recipient, owner funding source and agent wallet; network preparation is disclosed within that request. Signing approval, submitting on Arc and completing on Sepolia remain distinct actions. Pending hashes are not confirmed receipts.
- **Name & access starts with a name.** Public lookup comes before proof of control. A verified user can optionally link an agent wallet or manage named connections. Linking is an ownership association, not a payment authorization. Standard MCP setup stays under Connect an agent; public-key enrollment is an advanced path.
- Use the shared mist background, rounded white surfaces, approachable headings and muted relationship diagrams. Place registry, network and protocol details where they explain a decision. Keep testnet limitations visible without making sponsor names the information hierarchy.

The current Arc Payments queue remains separate from Sepolia Spending history. This presentation does not imply unified cross-chain indexing or automatic settlement. Wallet linking and named connection management still require their existing ownership checks and explicit signatures.


## Arc Payments redesign · September 12

Payments has two views: **Your payments** for real owner-scoped requests and **Accept payments** for the merchant acceptance flow and current integration scope. Keep manual request creation secondary. Collapse each request’s detailed review and setup behind its summary; preserve every existing signature, receipt check and recovery action. Filters distinguish in-progress payments from destination-confirmed payments.

The optional **See a purchase** walkthrough illustrates checkout by ENS identity, owner approval or decline, Circle settlement and merchant delivery. It uses isolated component state, no wallet calls or gateway writes, and explicit demo labels. Its merchant and ENS identity are examples. Simulated settlement and delivery never enter the real request queue.

Merchant acceptance currently explains the one supported Arc Testnet → Ethereum Sepolia route. Public checkout integration, exact invoice pricing, automatic destination relaying and delivery callbacks remain unfinished. Do not add selectable unsupported destinations or present the walkthrough as live evidence. The broader network vision belongs in the merchant view’s planned-direction note and the hackathon presentation.


## First merchant and final onboarding purchase

The optional follow-up is **Try a purchase**: the agent requests the Wayleave Developer Pack, the owner completes its payment in Payments, and verified destination settlement unlocks a versioned bundle. The step completes only after retrieval or a persisted fulfillment record is checked. Quotes display a bounded source debit, minimum merchant receipt, fee budget and additional gas; unused fee budget reaches the merchant. Public source remains free.

Wayleave is the first merchant; its storefront uses the same gateway quote and purchase records exposed by the merchant client and MCP. The presentation-only walkthrough now illustrates the same Developer Pack but never creates a real request. Configuration, portable Arc access and the local MCP build must be available for a real purchase. The existing Sepolia creation flow is not silently treated as Arc onboarding.

## Guided onboarding and additional chains — September 12

The flow is Connect → How your agent spends → Name your agent’s wallet → Add another chain → Connect your agent. Try a purchase is an optional follow-up. Keep connection copy short; “See how it works” opens the second step’s ownership, access and payment walkthrough. The user must acknowledge it before setup actions become available. Opening a step through navigation does not acknowledge it or mark any onchain work complete.

“Name your agent’s wallet” combines the Sepolia wallet deployment, ownership NFT and ENS registration in the existing checked creation transaction. Verify the receipt, registry ownership and ENS resolution before continuing. Do not send users to an external registration site for this wallet name.

“Add another chain” is a selectable list of supported networks. Arc Testnet is the available additional network today, needed by the current USDC payment route. Use the shared ChainWalletSetup component and a scrollable network list that exposes search as the catalog grows. Do not list unsupported networks as usable. Every additional chain creates a separate wallet and NFT; it does not bridge funds or move the original wallet. The owner can defer this step and return later.

ENS still resolves to the Sepolia wallet. Connecting an agent verifies the existing name with Wayleave, signs a separate association with the Arc wallet, then creates a scoped app connection. An association does not change ENS records or authorize payments. Reuse the name and wallet chosen earlier instead of asking the user to create them again. Only verified evidence marks setup complete; the optional first-purchase tracker remains separate from explanatory animation.

## Production style and separate store — September 12

Compared directly with the production setup page and `main`'s shared onboarding CSS. Reuse its underlined step navigation, left-hand action area and rounded green context panel. The final context panel tracks the real Developer Pack purchase through request, approval, Arc receipt, merchant receipt and verified delivery; there are no controls that advance a simulated checkout. Move product contents, pricing and machine-readable purchasing instructions to `/store/developer-pack`, a public Store section. The agent-facing instruction points to that public page; publication of the local route remains a separate deployment step.
