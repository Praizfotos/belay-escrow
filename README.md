<p align="center">
  <img src="public/brand/logo-horizontal.svg" alt="Belay" height="52" />
</p>

<h1 align="center">Belay — Fund Work. Release It Milestone by Milestone.</h1>

<p align="center">
  A non-custodial freelance milestone-escrow dApp built on the <strong>Stellar Network</strong>.<br/>
  Agree a milestone schedule, fund it into an on-chain vault, and release each milestone with a verifiable Stellar transaction.
</p>

<p align="center">
  <a href="https://github.com/Praizfotos/belay-escrow/actions/workflows/ci.yml">
    <img src="https://github.com/Praizfotos/belay-escrow/actions/workflows/ci.yml/badge.svg" alt="CI Pipeline" />
  </a>
  <img src="https://img.shields.io/badge/Network-Stellar%20Testnet-7B68EE?style=flat-square" alt="Stellar Testnet" />
  <img src="https://img.shields.io/badge/Contracts-Soroban%20(Rust)-blue?style=flat-square&logo=rust" alt="Soroban Contracts" />
  <img src="https://img.shields.io/badge/PWA-Installable-brightgreen?style=flat-square" alt="Installable PWA" />
</p>

---

## Table of Contents

- [Project Description](#project-description)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [How It Works](#how-it-works)
- [Smart Contract](#smart-contract)
- [Project Status & Production Roadmap](#project-status--production-roadmap)
- [Submission Checklist Evidence](#submission-checklist-evidence)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Wallet Authentication](#wallet-authentication)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Testnet Notes](#testnet-notes)
- [Final Documentation Package](#final-documentation-package)

---

## Project Description

Getting paid for freelance or remote work across borders is slow and untrusting. Clients don't want to pay 100% up front; freelancers don't want to work for free. Belay closes the loop with **on-chain milestone escrow**: the client funds the agreed schedule into a Soroban vault contract, the freelancer submits each milestone, and the client releases the exact amount when satisfied.

Every movement of value — funding, releasing, refunding — is a **real, verifiable Stellar transaction** against an escrow vault that holds a SEP-41 token (USDC on testnet by default). The vault's `fund`/`release`/`refund` entry points are authorized by the agreement contract, so tokens can only move along a path the milestone rules allow. A single agreement contract records the schedule and the rules; a companion vault contract holds the funds. The app syncs the agreement state across both parties in real time.

**Core design principles:**

- **Non-custodial** — your private key never leaves your wallet extension. Belay only receives the signed transaction envelope, and funds live in the contract, never in an account we control.
- **Real escrow, not a receipt log** — the vault transfers an actual SEP-41 token in and out; the payment and the record are the same atomic on-chain event.
- **On-chain receipts** — every fund, submit, release, and refund has a Stellar transaction hash you can verify on [stellar.expert](https://stellar.expert/explorer/testnet).
- **Multi-wallet** — supports Freighter, xBull, Lobstr, and Rabet via the maintained Stellar Wallets Kit, with WalletConnect documented as a one-step add in [docs/WALLET_INTEGRATION.md](docs/WALLET_INTEGRATION.md).

> **Trust model, stated plainly.** Disputes are resolved by a single configured **arbitrator** address, and the deploying **admin** key can upgrade the contracts. This is a deliberate MVP trade-off, not trust-minimized escrow. See [Architecture and Limitations](docs/ARCHITECTURE_AND_LIMITATIONS.md) and [§9 of the conversion guide](docs/PRODUCT_CONVERSION_GUIDE.md).

---

## Features

| Feature | Status |
| --- | --- |
| Multi-wallet connect (Freighter, xBull, Lobstr, Rabet) | Live |
| Create an agreement + milestone schedule | Live |
| Fund an agreement into an on-chain escrow vault (SEP-41 token / USDC) | Live |
| Submit a milestone with evidence | Live |
| Release / approve a milestone | Live |
| Refund an overdue milestone to the client | Live |
| Cancel an agreement and refund unspent balance | Live |
| Dispute + arbitrator resolution | Live (single arbitrator) |
| Transaction hash receipt linked to Stellar Explorer | Live |
| Real-time event listening from the contract | Live |
| Live cross-user sync via Supabase Realtime | Live |
| Sign-In-With-Stellar (signed challenge identity) | Live |
| Installable PWA with offline fallback | Live |
| Multi-sig / staking arbitrator, trust-minimized escrow | Roadmap |

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS 3.4, Framer Motion |
| Blockchain SDK | `@stellar/stellar-sdk` v14 |
| Wallet support | `@creit.tech/stellar-wallets-kit` v2 |
| Smart contracts | Soroban (Rust, `soroban-sdk` v27) |
| Network | Stellar Testnet (Horizon + Soroban RPC) |
| Database | Supabase (PostgreSQL + Realtime) |
| PWA | `@serwist/next` (Serwist) |
| Testing | Jest 29 + ts-jest; Rust inter-contract tests |
| State management | React Context + Supabase + localStorage |
| UI primitives | Radix UI, Lucide React |

---

## How It Works

```
Client connects wallet (Freighter / xBull / Lobstr / Rabet)
              |
Client creates an agreement + milestone schedule
              |
Client funds the agreement  ──►  vault.fund()
              |                     (escrow vault receives the SEP-41 token)
Wallet extension signs client-side
(private key never leaves the browser)
              |
Signed envelope submitted to Soroban RPC
              |
Freelancer submits a milestone (evidence)  ──►  agreement.submit_milestone()
              |
Client approves  ──►  agreement approves  ──►  vault.release()
              |                                    (token → freelancer)
  ...or it is overdue  ──►  vault.refund()  (token → client)
  ...or it is disputed ──►  arbitrator resolves (release or refund)
              |
Contract events emitted; useContractEvents polls and syncs all participants
```

---

## Smart Contract

Belay deploys **two Soroban contracts** to Stellar Testnet from a single `belay-contract` crate:

- **Agreement contract** — records agreements and milestones and decides *when* value moves.
- **Escrow vault contract** — holds the SEP-41 token and is the only code that moves it. Its `fund`/`release`/`refund` entry points require authorization from the agreement contract (its `controller`).

### Deployed Contracts (Testnet)

> **Proof values to regenerate.** After running [`scripts/deploy-contract.sh`](scripts/deploy-contract.sh), replace the placeholders below with the printed IDs and the resulting fund→release transaction hash.

| Contract Role | Contract ID | Explorer |
| --- | --- | --- |
| Belay agreement contract | `<BELAY_CONTRACT_ID>` | [View](https://stellar.expert/explorer/testnet/contract/<BELAY_CONTRACT_ID>) |
| Escrow vault contract | `<VAULT_CONTRACT_ID>` | [View](https://stellar.expert/explorer/testnet/contract/<VAULT_CONTRACT_ID>) |
| Escrow token (USDC SAC) | `<ESCROW_TOKEN_ID>` | [View](https://stellar.expert/explorer/testnet/contract/<ESCROW_TOKEN_ID>) |

Network: Stellar Testnet  
Language: Rust (`soroban-sdk` v27)

### Verified On-Chain Transactions

> Replace with the transactions from your deployment and end-to-end run.

- Agreement deploy tx: `<TX_HASH>`
- Vault deploy tx: `<TX_HASH>`
- Vault init tx (`init_vault`): `<TX_HASH>`
- Agreement init tx (`init`): `<TX_HASH>`
- End-to-end fund → release proof tx (agreement release triggers vault transfer): `<TX_HASH>`

The final proof transaction is verifiable evidence of the inter-contract path: an agreement milestone release triggers the vault to transfer the escrowed token to the freelancer in the same on-chain execution.

### Contract Functions

**Agreement contract**

| Function | Type | Purpose |
| --- | --- | --- |
| `init(admin, vault)` | Write | Bind the admin and the vault contract address |
| `create_agreement(...)` | Write | Create an agreement with its milestone schedule |
| `add_milestone(...)` | Write | Add a milestone (amount, description, optional due date) |
| `fund_agreement(...)` | Write | Authorize the vault to pull the funded token |
| `submit_milestone(...)` | Write | Freelancer marks a milestone submitted with evidence |
| `approve_milestone(...)` | Write | Client releases the milestone → vault pays freelancer |
| `refund_overdue_milestone(...)` | Write | Return an overdue milestone's funds to the client |
| `dispute(...)` / `resolve(...)` | Write | Raise / resolve a dispute (arbitrator) |
| `cancel_agreement(...)` | Write | Cancel and refund unspent balance |
| `get_agreement(...)` / `get_milestone(...)` | Read | Read state |

**Escrow vault contract**

| Function | Type | Purpose |
| --- | --- | --- |
| `init_vault(admin, controller, token)` | Write | Bind admin, controller (agreement contract), and SEP-41 token |
| `fund(...)` / `release(...)` / `refund(...)` | Write | Move the token under controller authorization |
| `balance()` | Read | Current escrowed balance |

**Error codes handled by the frontend** (decoded from Soroban contract errors):

| Code | Name | Meaning |
| --- | --- | --- |
| #1 | `InvalidAmount` | Amount is zero or negative |
| #2 | `AlreadyPaid` | This milestone was already released |
| #3 | `EmptyId` | An id is an empty string |
| #101+ | `VaultErrorCode` | Vault-specific failures (uninitialized, insufficient balance, …) |

### Why Two Contracts?

The separation keeps custody and policy apart: the agreement contract encodes the milestone rules, and the vault contract is the *only* thing that ever holds or moves tokens. Because the vault trusts only its controller, an agreement bug cannot be paired with an arbitrary external spender, and rotating the controller (`set_controller`) immediately revokes the previous contract's authority.

### Real-Time Events

The contracts emit events for every state change (agreement created, milestone added, funded, submitted, released, refunded, disputed, cancelled). `hooks/useContractEvents.ts` polls the Soroban RPC and merges deduplicated events into React state, so both participants see confirmed changes without refreshing.

---

## Project Status & Production Roadmap

**Status: Testnet beta.** Belay runs entirely on Stellar **Testnet** — no real funds move yet. Dispute resolution is a single arbitrator, and the admin key can upgrade the contracts; both are documented honestly rather than hidden.

The complete plan to take Belay from project to shipped product — including every known trust gap and how it is closed — lives in **[docs/PRODUCT_CONVERSION_GUIDE.md](docs/PRODUCT_CONVERSION_GUIDE.md)**.

| Area | Today | Next |
| --- | --- | --- |
| Network | Stellar Testnet | Mainnet (after a contract audit) |
| Escrow asset | SEP-41 token (USDC on testnet) | Curated stablecoin allowlist on mainnet |
| Dispute resolution | Single arbitrator key | Multi-sig / staking appeal mechanism |
| Upgrade authority | Deploying admin | Timelock / multisig, or renounced |
| Settlement integrity | Real vault custody (atomic token transfer) | Audited contracts |
| Wallets | Freighter, xBull, Lobstr, Rabet | + WalletConnect (mobile), passkey smart wallets |
| App shell | Installable PWA, nonce-based CSP | Push notifications, offline reads |
| Identity | Sign-In-With-Stellar (signed challenge) | Passkey onboarding for non-crypto users |

Verified locally with `npm run build`, `npm run lint`, and `npm test`.

---

## Submission Checklist Evidence

This section maps the required submission checklist to concrete proof in this repository.

| Requirement | Proof |
| --- | --- |
| Public GitHub repository | https://github.com/Praizfotos/belay-escrow |
| README with complete documentation | This file plus links in [Final Documentation Package](#final-documentation-package) |
| Minimum 8+ meaningful commits | Git history — verify the count before submission |
| Screenshot or badge: CI/CD pipeline running | CI badge at the top of this README (GitHub Actions `ci.yml`) |
| Contract addresses and transaction hash (inter-contract) | [Deployed Contracts](#deployed-contracts-testnet) and [Verified On-Chain Transactions](#verified-on-chain-transactions) |
| Token or vault address (custom token/contract deployed) | Escrow vault contract + escrow token in [Deployed Contracts](#deployed-contracts-testnet) |

---

## Setup Instructions

### Prerequisites

- **Node.js** v18 or later, **npm** v9 or later
- **Freighter Wallet** browser extension — [freighter.app](https://freighter.app) (Settings → Network → **Testnet**)
- A funded Stellar Testnet account — free XLM from [Stellar Friendbot](https://horizon-testnet.stellar.org/friendbot?addr=YOUR_PUBLIC_KEY)
- The escrow token trustline enabled on the paying account (the app's **Enable escrow token** action does this)
- (Contract work only) Rust + the Stellar CLI — see [docs/RUNBOOK.md](docs/RUNBOOK.md)

### 1. Clone the repository

```bash
git clone https://github.com/Praizfotos/belay-escrow.git
cd belay-escrow
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a Supabase project

Belay uses Supabase for real-time cross-user sync. Without it, data only persists locally in the current browser.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the full schema from [`supabase-setup.sql`](supabase-setup.sql) (or follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)).
3. Copy your **Project URL** and **anon key** from Project Settings → API.
4. Copy your **JWT Secret** from the same page into `SUPABASE_JWT_SECRET`.

### 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

The Stellar testnet contract values are pre-filled. See [Environment Variables](#environment-variables) for the full reference.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and connect your wallet (set to Testnet).

### 6. Build for production

```bash
npm run build
npm run start
```

---

## Environment Variables

Create (or edit) `.env.local` in the project root:

```env
# Stellar Network
NEXT_PUBLIC_STELLAR_NETWORK=TESTNET
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_EXPLORER=https://stellar.expert/explorer/testnet

# Belay contracts (deployed — see scripts/deploy-contract.sh)
NEXT_PUBLIC_CONTRACT_ID=<belay-agreement-contract-id>
NEXT_PUBLIC_VAULT_CONTRACT_ID=<escrow-vault-contract-id>
NEXT_PUBLIC_ESCROW_TOKEN_ID=<sep-41-token-id>

# Supabase (Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# App
NEXT_PUBLIC_APP_NAME=Belay
NEXT_PUBLIC_APP_VERSION=0.1.0

# ─── Server-only — never prefix these with NEXT_PUBLIC_ ─────────────────────
# Supabase Dashboard → Settings → API → JWT Secret. Required to authorize RLS.
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
# Binds an auth challenge to the wallet it was issued to. Required in
# production and must differ from SUPABASE_JWT_SECRET (the server refuses to
# boot otherwise); falls back to it in dev. Generate: openssl rand -base64 48
AUTH_CHALLENGE_SECRET=
# Optional. Session lifetime in seconds (default 43200 = 12h, max 86400).
AUTH_SESSION_TTL_SECONDS=43200
# Required for multi-instance deploys: backs the shared replay guard, rate
# limiter, and revocation tables.
SUPABASE_SERVICE_ROLE_KEY=
```

> Variables with the `NEXT_PUBLIC_` prefix are read client-side and are inlined into the JavaScript bundle — treat every one of them as public. The Supabase anon key is safe to expose because access is governed by Row Level Security.
>
> `SUPABASE_JWT_SECRET`, `AUTH_CHALLENGE_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` are **not** public. They are read only inside server route handlers. Prefixing any with `NEXT_PUBLIC_` would ship it to every visitor and let anyone mint a token for any wallet.

---

## Wallet Authentication

Your Stellar address is your identity, and the app proves you control it before the database will accept it — a SEP-10 style challenge/response:

1. **Challenge** — `POST /api/auth/challenge` returns a transaction built for your address with **sequence number 0**, carrying a random nonce. Sequence 0 is always below an account's real sequence, so the network can never accept it: it is signable but unsubmittable, and costs no fee.
2. **Sign** — your wallet (Freighter, xBull, Lobstr) signs it locally. Your private key never leaves the extension.
3. **Verify** — `POST /api/auth/verify` checks the signature against the claimed public key and, only on success, mints a short-lived Supabase JWT whose `wallet_address` claim carries the proven address. The token is signed with `SUPABASE_JWT_SECRET`, which never reaches the browser.
4. **Authorize** — every RLS policy reads that claim via `public.belay_wallet()`. Requests without a valid token get no rows at all.

The token is cached in `localStorage` (`belay:session`) and reused until it expires (12 hours by default), so you sign roughly once a day rather than once per action. Signing out writes the token's `jti` to `public.revoked_tokens`, so a signed-out token matches no row. See [docs/AUTHENTICATION_SETUP.md](docs/AUTHENTICATION_SETUP.md).

---

## Testing

### JavaScript / TypeScript unit tests

```bash
npm test
```

For a coverage report:

```bash
npm run test:coverage
```

Suites cover the escrow planner and status logic, contract error decoding, event parsing, Supabase row guards and privacy rules, the offline cache isolation in `AgreementContext`, auth (challenge, JWT, rate limiting, revocation), observability/redaction, and CSP. npm run test:coverage generates a coverage report.

### Rust contract tests

```bash
cd contract
cargo test
```

Covers agreement lifecycle, milestone state transitions, funding, release/refund paths, and the inter-contract call into the vault.

---

## Project Structure

```
belay/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── auth/page.tsx               # Authentication
│   ├── dashboard/page.tsx          # Dashboard (wallet + escrow balance)
│   ├── agreements/
│   │   ├── page.tsx                # Agreement list
│   │   ├── new/page.tsx            # Create agreement + milestones
│   │   └── [id]/page.tsx           # Agreement detail — milestone board
│   ├── manifest.ts, sw.ts          # PWA manifest + Serwist service worker
│   └── api/auth/                   # challenge / verify / signout routes
│
├── components/
│   ├── landing/                    # Hero, Features, HowItWorks
│   ├── agreements/                # AgreementForm, MilestoneForm/List, DisputeDialog, EscrowSummary
│   ├── payment/                    # FundButton, EscrowStatus, TransactionHash
│   ├── wallet/                     # ConnectWalletButton, WalletInfo, NetworkGuardBanner
│   └── ui/                         # Button, Modal, Badge, Spinner, Toast, Logo
│
├── context/                        # AuthContext, AgreementContext, MilestoneContext, WalletContext
├── hooks/                          # useWallet, useAgreement, useMilestone, useEscrow, useContractEvents
│
├── lib/
│   ├── auth/                       # challenge, jwt, serverConfig, rateLimit (server)
│   ├── escrow/                     # planner.ts, status.ts
│   ├── supabase/                   # session, rowGuards, userDirectoryPrivacy
│   ├── stellar/                    # walletsKit, contract, events, buildTransaction, submitTransaction
│   ├── config/requirements.ts      # Build-time config validation
│   └── observability/              # logger, redact, requestLog
│
├── contract/                       # Soroban contracts (Rust)
│   └── src/{lib.rs,vault.rs,...}
│
├── __tests__/                      # escrow, stellar, supabase, auth, observability, ...
│
└── docs/                           # Full documentation package (see below)
```

---

## Testnet Notes

- This app runs entirely on **Stellar Testnet** — no real funds are used.
- Fund your testnet wallet with Friendbot:
  ```
  https://horizon-testnet.stellar.org/friendbot?addr=YOUR_PUBLIC_KEY
  ```
- Enable the escrow token trustline (the dashboard's **Enable escrow token** action) before funding an agreement.
- All transactions and contract events are visible at [stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet).

---

## Final Documentation Package

**Product & strategy**
- [Product Conversion Guide](docs/PRODUCT_CONVERSION_GUIDE.md) — the full project→product roadmap
- [Brand Guidelines](docs/BRAND.md)
- [Wallet Integration](docs/WALLET_INTEGRATION.md)

**Getting started & testing**
- [Quickstart](docs/QUICKSTART.md)
- [Supabase Setup](docs/SUPABASE_SETUP.md)
- [Authentication](docs/AUTHENTICATION_SETUP.md)
- [Manual Testing Guide](docs/MANUAL_TESTING_GUIDE.md)

**Operations & architecture**
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Production Runbook](docs/RUNBOOK.md)
- [Requirement-to-Proof Matrix](docs/REQUIREMENT_PROOF_MATRIX.md)
- [Architecture Assumptions and Known Limitations](docs/ARCHITECTURE_AND_LIMITATIONS.md)
- [Observability](docs/OBSERVABILITY.md)

---

## License

MIT © 2026 Belay
