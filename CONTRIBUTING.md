# Contributing to Belay

Welcome! This project is a milestone-escrow dApp on Stellar Soroban, now branded **Belay**.

## Getting Started

### Prerequisites

- [Rust toolchain](https://www.rust-lang.org/learn/get-rust) (stable, `wasm32v1-none` target) — see `contract/rust-toolchain.toml`
- [Node.js](https://nodejs.org/) (v18+ recommended) and [pnpm](https://pnpm.io/) / npm
- A [Stellar account](https://www.stellar.org/docs/start/) with testnet fund for local development

### Local Development

**Contract**

```bash
cd contract
cargo test       # runs 57 tests (40 agreement + 17 vault)
cargo build      # produces belay_contract.wasm + belay_vault.wasm
```

**Frontend**

```bash
npm install
npm run dev      # starts Next.js dev server at http://localhost:3000
npx test         # runs 439 Jest tests across 36 suites
npx tsc --noEmit # typecheck (0 errors)
```

### Repository Structure

- `contract/` — Soroban workspace: `belay-contract` + `belay-vault` crates
- `app/` — Next.js 14 app router pages and layouts
- `components/` — React UI components (Radix, Framer Motion, lucide-react)
- `context/` — React contexts (`AgreementContext`, `MilestoneContext`, `WalletContext`)
- `hooks/` — Custom React hooks (`useAgreement`, `useMilestone`, `useEscrow`, `useWallet`)
- `lib/` — Utility libraries (escrow planner/status, stellar RPC helpers, Supabase client, constants)
- `types/` — TypeScript type definitions (`types/agreement.ts`, `types/contract.ts`, `types/wallet.ts`, `types/stellar.ts`, `types/supabase.ts`)
- `docs/` — Operational docs (architecture, quickstart, supabase setup, authentication, release checklist, requirement-proof matrix, runbook, manual testing, observability, brand, requirement-proof matrix, contributing)
- `scripts/` — Automation scripts (deploy-contract.sh)
- `__tests__/` — Test data and supplementary test configurations

## Making Changes

1. **Create a branch** from `main` describing your change (e.g. `feature/belay-contract-rename`, `fix/wallet-context-null-guard`).
2. **Make logical, atomic changes** — keep related edits in the same file; avoid scattering a single concern across many files unless the change genuinely spans multiple areas.
3. **Run the test suites** (`npm test`, `cargo test`, `npx tsc --noEmit`) before committing to confirm nothing is broken.
4. **Follow the existing commit message style** — concise summary (≤50 chars), optionally a blank line then more detail. Reference relevant issue numbers with `#XX`.
5. **Do not rewrite git history** — no `reset`, `rebase`, or `filter-branch`. Preserve all 228 commits and 13 contributors.
6. **If adding a new feature or modifying an existing one, add or update tests** to cover the new behavior or prevent regression. Tests must not be weakened or skipped to achieve a green result.
7. **When renaming crates, directories, or domain terms** (e.g. `pactx` → `belay`, `engagement` → `agreement`), update every reference: imports, Cargo.toml, environment variables, documentation, test expectations, and scripts. Run a full `rg` sweep after changes to confirm no stale tokens remain.

## Pull Request Process

1. Push your branch to your fork.
2. Open a Pull Request against `main` in the Belay repo.
3. Ensure all CI checks pass (contract tests, typecheck, lint, Jest).
4. Address any reviewer feedback. Keep commits bisectable — if you must amend a commit, use `git commit --amend` on the most recent commit only, or create a new commit; do not squash or rebase to erase history.
5. After approval, a maintainer will merge into `main`.

## Security Disclosure

If you discover a security issue, please report it privately via [GitHub Security Advisories](https://github.com/features/security/advisories) — do not create a public issue or disclose the vulnerability until it is resolved. There is no formal bug bounty program at this time, but reports are appreciated and will be acknowledged.

## Code of Conduct

This project embraces a respectful, inclusive, and professional collaboration culture. Harassment, exclusionary behavior, or bad-faith engagement are not tolerated. Maintainers reserve the right to remove, edit, or reject contributions that fall outside these guidelines.