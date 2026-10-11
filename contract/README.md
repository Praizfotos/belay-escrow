# Belay Contracts

Soroban smart contracts for **Belay**, a freelance milestone escrow dApp on
Stellar. A client and a freelancer agree on milestones; the client funds the
agreement with a SEP‑41 token (USDC on testnet by default), the tokens are held
by a separate vault contract, and the freelancer is paid milestone by milestone
as the client approves work.

- **Belay contract** — agreement + milestone state machine (`BelayContract`).
- **Escrow vault** — SEP‑41 token custody (`EscrowVaultContract`).

Both are written in Rust against `soroban-sdk` 27 and target `wasm32v1-none`.

## Workspace layout

The repo is a Cargo workspace with one crate per deployable contract (a wasm can
only export one contract's functions, and both contracts legitimately expose
`upgrade` / `migrate`, so they cannot share a crate):

```
contract/
├── Cargo.toml            # virtual workspace + release profiles
├── rust-toolchain.toml   # stable + wasm32v1-none
├── src/
│   ├── lib.rs            # BelayContract
│   ├── vault.rs          # EscrowVaultContract (source shared with the vault crate)
│   ├── vault_client.rs   # caller-side client for the vault (no impl, no exports)
│   ├── test.rs           # Belay integration suite
│   └── test_token.rs     # test-only SEP-41 stand-in (#[cfg(test)] only)
├── belay/Cargo.toml      # crate `belay-contract`, lib path ../src/lib.rs
└── vault/
    ├── Cargo.toml        # crate `belay-vault`
    └── src/lib.rs        # pulls in ../../src/vault.rs as the wasm crate root
```

`src/test_token.rs` and the test modules are behind `#[cfg(test)]`; the test
token is never linked into either production wasm. The Belay crate only calls
the vault through the generated client in `src/vault_client.rs`, so the vault
implementation is never linked into the Belay wasm.

## Belay contract (`BelayContract`)

### Types

```rust
AgreementStatus   { Draft=0, Funded=1, Completed=2, Cancelled=3 }
MilestoneStatus   { Pending=0, Submitted=1, Released=2, Refunded=3, Disputed=4 }

Milestone { index, amount, description, due_at, status,
            evidence, submitted_at, resolved_at }
Agreement { id, client, freelancer, title, status, total,
            escrowed, released, refunded, milestone_count,
            created_at, funded_at, closed_at }
AgreementPage { agreements: Vec<Agreement>, next_offset: Option<u32> }
```

### Storage layout

| Scope      | Key                              | Value               | Notes                                    |
|------------|----------------------------------|---------------------|------------------------------------------|
| Instance   | `Version`                        | `u32`               | contract version, `1`                    |
| Instance   | `Admin`                          | `Address`           | config authority                         |
| Instance   | `Vault`                          | `Address`           | configured escrow vault                  |
| Instance   | `Arbitrator`                     | `Option<Address>`   | falls back to `Admin` when unset         |
| Persistent | `Agreement(String)`              | `Agreement`         | keyed by agreement id                    |
| Persistent | `Milestones(String)`             | `Vec<Milestone>`    | capped at `MAX_MILESTONES = 24`          |
| Persistent | `ClientCount(Address)`           | `u32`               | number of agreements as client           |
| Persistent | `ClientAt(Address, u32)`         | `String`            | per-account index → id                   |
| Persistent | `ClientIndex(Address, String)`   | `u32`               | id → position (dedupe guard)             |
| Persistent | `FreelancerCount/At/Index(...)`  | same                | separate freelancer index                |

Instance and persistent entries are bumped with a 30‑day threshold to a
365‑day TTL on every read/write (`LEDGERS_PER_DAY = 17_280`).

Limits: id ≤ 64, title ≤ 120, description ≤ 240, evidence ≤ 480, reason ≤ 240
chars; amount > 0 and ≤ `MAX_AMOUNT_STROOPS` (10^16); ≤ 24 milestones; page
size 1..25.

### State machines

Agreement:

```
create_agreement ─▶ Draft ──fund_agreement (escrowed == total)──▶ Funded
                      │                                             │
                      │ cancel_agreement                            │ every milestone terminal
                      ▼                                             ▼
                  Cancelled                                     Completed
   (Funded may also cancel while no milestone is Submitted/Disputed)
```

Milestone:

```
Pending ──submit_milestone──▶ Submitted ──approve_milestone──▶ Released
   │                              │
   │                              ├─ dispute_milestone (client) ─┐
   │                              └─ escalate_milestone (free.)   │
   │                                                              ▼
   │                                                          Disputed
   │                                                              │
   │                                        resolve_dispute ──────┤
   │                                        (arbitrator/admin)    ├─▶ Released
   │                                                              └─▶ Refunded
   └──refund_overdue_milestone (past due_at, client)──────────────▶ Refunded
```

An agreement becomes `Completed` automatically once every milestone is
`Released` or `Refunded`.

### Authorization boundaries

| Function | Required auth |
|---|---|
| `init` | `admin` |
| `upgrade`, `migrate`, `set_vault`, `set_arbitrator`, `clear_arbitrator` | `admin` |
| `create_agreement`, `add_milestone`, `fund_agreement`, `approve_milestone`, `dispute_milestone`, `refund_overdue_milestone`, `cancel_agreement` | `client` |
| `submit_milestone`, `escalate_milestone` | `freelancer` |
| `resolve_dispute` | arbitrator when configured, otherwise `admin` |
| `has_agreement`, `get_agreement`, `get_milestones`, `get_*_agreements`, `get_vault`, `get_arbitrator` | none (read-only) |

Money only moves through the vault, and the vault will only move it for the
configured controller (this contract). `approve_milestone`, `resolve_dispute`,
`refund_overdue_milestone` and `cancel_agreement` are the only operations that
trigger a vault release/refund.

### Errors — `BelayError` (1..32)

```
1  InvalidAmount        9  AlreadyInitialized   17 MilestoneExists    25 NotOverdue
2  AmountTooLarge       10 NotInitialized       18 InvalidStatus      26 VersionMismatch
3  EmptyId              11 InvalidActor         19 NotFullyFunded     27 InvalidPage
4  IdTooLong            12 AgreementExists      20 AlreadyFullyFunded 28 IndexOverflow
5  TitleTooLong         13 AgreementNotFound    21 NotDisputed       29 InsufficientEscrow
6  DescriptionTooLong   14 MilestoneNotFound    22 NoArbitrator       30 SameParty
7  EvidenceTooLong      15 InvalidMilestoneIndex 23 Unauthorized      31 NoMilestones
8  ReasonTooLong        16 TooManyMilestones    24 CannotCancel       32 AlreadyTerminal
```

### Events

Topics are `symbol_short!` (≤ 9 chars), one versioned struct per family:

`px_init`, `agr_cre`, `mil_add`, `agr_fund`, `mil_sub`, `mil_appr`, `mil_dsp`,
`mil_res`, `mil_ref`, `agr_cnc`, `agr_cmp`, `vault_cfg`, `arb_set`, `arb_clr`,
`upgrade`, `migrate`.

## Escrow vault (`EscrowVaultContract`)

Deliberately dumb: it knows nothing about milestones, disputes or approvals. It
enforces exactly three rules — the controller authorizes every movement, no
movement exceeds what is locked for an agreement, and the token cannot be
rotated while anything is locked.

### Storage layout

| Scope      | Key                    | Value                                            |
|------------|------------------------|--------------------------------------------------|
| Instance   | `Version`              | `u32`                                            |
| Instance   | `Config`               | `VaultConfig { admin, controller, token }`       |
| Persistent | `Locked(String)`       | `i128` — tokens locked for one agreement         |
| Persistent | `TotalLocked`          | `i128` — sum of every `Locked` entry             |

### State / invariants

- `fund` requires the **controller** (Belay) *and* `from` to authorize, then
  pulls tokens from `from` into the vault.
- `release` / `refund` require the **controller** only, then pay `to` and
  decrement the lock. A contract address satisfies `require_auth()` only for a
  call it makes itself, so the controller check is enforced by the host.
- `set_token` reverts with `TokenInUse` while `TotalLocked > 0`.
- `set_controller` immediately revokes the previous controller (enforcement
  reads the stored config on every call).

### Errors — `VaultError` (101..111)

```
101 AlreadyInitialized  104 InsufficientEscrow  107 InvalidActor     110 IdTooLong
102 NotInitialized      105 BalanceOverflow     108 AmountTooLarge   111 EmptyId
103 InvalidAmount       106 VersionMismatch      109 TokenInUse
```

### Events

`vault_ini`, `vault_cfg`, `vlt_fund`, `vlt_rel`, `vlt_ref`, `upgrade`,
`migrate`.

## Build

The workspace pins `rust-toolchain.toml` (`stable` + `wasm32v1-none`), so run
every command from inside `contract/` (or pass `--manifest-path`).

```sh
# tests (runs both crates: Belay + vault = 57 tests)
cd contract && cargo test

# clippy
cargo clippy --workspace --all-targets

# optimized wasm (builds BOTH contracts)
stellar contract build
```

The same commands work from the repo root without `cd`:

```sh
cargo test --manifest-path contract/Cargo.toml
stellar contract build --manifest-path contract/Cargo.toml
```

Artifacts:

```
contract/target/wasm32v1-none/release/belay_contract.wasm   # BelayContract
contract/target/wasm32v1-none/release/belay_vault.wasm      # EscrowVaultContract
```

To build a single contract: `stellar contract build --package belay-contract`
or `stellar contract build --package belay-vault`.

## Deploy (testnet)

```sh
# 1. Deploy the vault first (it needs the token address).
stellar contract deploy \
  --wasm target/wasm32v1-none/release/belay_vault.wasm \
  --source <ADMIN_SECRET> --network testnet
# → VAULT_ID

stellar contract invoke --id <VAULT_ID> \
  --source <ADMIN_SECRET> --network testnet -- \
  init_vault --admin <ADMIN> --controller <BELAY_ID> --token <ESCROW_TOKEN_ID>
# (deploy Belay first if you need BELAY_ID up front; the controller can be
#  re-pointed later with set_controller before any funds are locked.)

# 2. Deploy Belay and point it at the vault.
stellar contract deploy \
  --wasm target/wasm32v1-none/release/belay_contract.wasm \
  --source <ADMIN_SECRET> --network testnet
# → BELAY_ID

stellar contract invoke --id <BELAY_ID> \
  --source <ADMIN_SECRET> --network testnet -- \
  init --admin <ADMIN> --vault <VAULT_ID>
```

Then wire the frontend env vars: `NEXT_PUBLIC_CONTRACT_ID`,
`NEXT_PUBLIC_VAULT_CONTRACT_ID`, `NEXT_PUBLIC_ESCROW_TOKEN_ID`.

Upgrades use `stellar contract upload` + `upgrade` (admin-gated); `migrate` is a
no-op at the current version and guarded by `VersionMismatch` otherwise.
