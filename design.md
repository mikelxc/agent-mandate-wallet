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

The landing page is one continuous introduction. Keep the brand visible and hide the workspace navigation links. Include the agent connection guide on the same page; “Start from your agent” scrolls to it.

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
