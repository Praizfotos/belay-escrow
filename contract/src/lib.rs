#![no_std]

//! Belay — milestone escrow agreements on Stellar Soroban.
//!
//! A client and a freelancer agree on a set of milestones. The client funds
//! the agreement with a SEP-41 token (USDC by default); the tokens sit in a
//! companion [`vault`] contract, never with Belay itself. The freelancer
//! submits work milestone by milestone; the client approves, which releases
//! that milestone's tokens to the freelancer. If the client goes quiet, the
//! freelancer can escalate, and if the parties disagree an arbitrator (or the
//! contract admin, when none is configured) resolves the disputed milestone.
//!
//! Funds can only leave the vault on the controller's instruction, and this
//! contract only issues that instruction after checking the state machine and
//! the right party's signature. See `docs/ARCHITECTURE_AND_LIMITATIONS.md`.

pub mod vault_client;

#[cfg(test)]
mod test_token;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short,
    Address, BytesN, Env, String, Vec,
};

use crate::vault_client::EscrowVaultClient;

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum BelayError {
    InvalidAmount        = 1,
    AmountTooLarge       = 2,
    EmptyId              = 3,
    IdTooLong            = 4,
    TitleTooLong         = 5,
    DescriptionTooLong   = 6,
    EvidenceTooLong      = 7,
    ReasonTooLong        = 8,
    AlreadyInitialized   = 9,
    NotInitialized       = 10,
    InvalidActor         = 11,
    AgreementExists      = 12,
    AgreementNotFound    = 13,
    MilestoneNotFound    = 14,
    InvalidMilestoneIndex = 15,
    TooManyMilestones    = 16,
    MilestoneExists      = 17,
    InvalidStatus        = 18,
    NotFullyFunded       = 19,
    AlreadyFullyFunded   = 20,
    NotDisputed          = 21,
    NoArbitrator         = 22,
    Unauthorized         = 23,
    CannotCancel         = 24,
    NotOverdue           = 25,
    VersionMismatch      = 26,
    InvalidPage          = 27,
    IndexOverflow        = 28,
    InsufficientEscrow   = 29,
    SameParty            = 30,
    NoMilestones         = 31,
    AlreadyTerminal      = 32,
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/// Agreement lifecycle.
///
/// `Draft` covers both "no milestones yet" and "created, not fully funded".
/// It becomes `Funded` the moment the escrowed total reaches the milestone
/// total, and `Completed` when every milestone is terminal. `Cancelled` is a
/// client-driven exit that refunds whatever is still escrowed.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgreementStatus {
    Draft     = 0,
    Funded    = 1,
    Completed = 2,
    Cancelled = 3,
}

/// Per-milestone lifecycle.
///
/// `Pending` → (submit) → `Submitted` → (approve) → `Released`
///                                   ↘ (dispute/escalate) → `Disputed`
///                                          → (resolve) → `Released` | `Refunded`
/// `Pending` → (refund_overdue) → `Refunded`
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MilestoneStatus {
    Pending   = 0,
    Submitted = 1,
    Released  = 2,
    Refunded  = 3,
    Disputed  = 4,
}

#[contracttype]
#[derive(Clone)]
pub struct Milestone {
    pub index:        u32,
    pub amount:       i128,
    pub description:  String,
    /// Absolute Unix timestamp after which the client may reclaim this
    /// milestone if it was never submitted. `0` means "no deadline".
    pub due_at:       u64,
    pub status:       MilestoneStatus,
    /// Free-form submission note from the freelancer; empty until submitted.
    pub evidence:     String,
    pub submitted_at: u64,
    pub resolved_at:  u64,
}

#[contracttype]
#[derive(Clone)]
pub struct Agreement {
    pub id:              String,
    pub client:          Address,
    pub freelancer:      Address,
    pub title:           String,
    pub status:          AgreementStatus,
    /// Sum of every milestone amount.
    pub total:           i128,
    /// Tokens currently held by the vault for this agreement.
    pub escrowed:        i128,
    /// Cumulative tokens released to the freelancer.
    pub released:        i128,
    /// Cumulative tokens refunded to the client.
    pub refunded:        i128,
    pub milestone_count: u32,
    pub created_at:      u64,
    pub funded_at:       u64,
    pub closed_at:       u64,
}

#[contracttype]
#[derive(Clone)]
pub struct AgreementPage {
    pub agreements:  Vec<Agreement>,
    /// Cursor for the next page, or `None` on the last page.
    pub next_offset: Option<u32>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Events (versioned, one struct per event family)
// ─────────────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct AgreementCreatedEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub client:       Address,
    pub freelancer:   Address,
    pub title:        String,
    pub timestamp:    u64,
}

#[contracttype]
#[derive(Clone)]
pub struct MilestoneAddedEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub index:        u32,
    pub amount:       i128,
    pub timestamp:    u64,
}

#[contracttype]
#[derive(Clone)]
pub struct AgreementFundedEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub amount:       i128,
    pub escrowed:     i128,
    pub fully_funded: bool,
    pub timestamp:    u64,
}

#[contracttype]
#[derive(Clone)]
pub struct MilestoneSubmittedEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub index:        u32,
    pub evidence:     String,
    pub timestamp:    u64,
}

#[contracttype]
#[derive(Clone)]
pub struct MilestoneApprovedEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub index:        u32,
    pub amount:       i128,
    pub freelancer:   Address,
    pub timestamp:    u64,
}

#[contracttype]
#[derive(Clone)]
pub struct MilestoneDisputedEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub index:        u32,
    pub by:           Address,
    pub reason:       String,
    pub timestamp:    u64,
}

#[contracttype]
#[derive(Clone)]
pub struct MilestoneResolvedEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub index:        u32,
    /// `true` when the resolution paid the freelancer; `false` when it
    /// refunded the client.
    pub released:     bool,
    pub amount:       i128,
    pub resolver:     Address,
    pub timestamp:    u64,
}

#[contracttype]
#[derive(Clone)]
pub struct MilestoneRefundedEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub index:        u32,
    pub amount:       i128,
    pub timestamp:    u64,
}

#[contracttype]
#[derive(Clone)]
pub struct AgreementCancelledEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub refunded:     i128,
    pub timestamp:    u64,
}

#[contracttype]
#[derive(Clone)]
pub struct AgreementCompletedEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub released:     i128,
    pub refunded:     i128,
    pub timestamp:    u64,
}

#[contracttype]
#[derive(Clone)]
pub struct ConfigEventV1 {
    pub version:    u32,
    pub subject:    Address,
    pub updated_by: Address,
    pub timestamp:  u64,
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage
// ─────────────────────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    // Instance
    Version,
    Admin,
    Vault,
    Arbitrator,
    // Persistent — agreements
    Agreement(String),
    Milestones(String),
    // Persistent — per-account agreement indexes (bounded shards)
    ClientCount(Address),
    ClientAt(Address, u32),
    ClientIndex(Address, String),
    FreelancerCount(Address),
    FreelancerAt(Address, u32),
    FreelancerIndex(Address, String),
}

const LEDGERS_PER_DAY:        u32 = 17_280;
const STORAGE_BUMP_THRESHOLD: u32 = LEDGERS_PER_DAY * 30;
const STORAGE_BUMP_AMOUNT:    u32 = LEDGERS_PER_DAY * 365;

const CONTRACT_VERSION:       u32 = 1;
const MIN_MIGRATABLE_VERSION: u32 = 1;

const MAX_ID_LEN:             u32 = 64;
const MAX_TITLE_LEN:          u32 = 120;
const MAX_DESCRIPTION_LEN:    u32 = 240;
const MAX_EVIDENCE_LEN:       u32 = 480;
const MAX_REASON_LEN:         u32 = 240;
const MAX_MILESTONES:         u32 = 24;
const MAX_PAGE_SIZE:          u32 = 25;
const MAX_AMOUNT_STROOPS:     i128 = 10_000_000_000_000_000;

#[contract]
pub struct BelayContract;

// SDK 27 nudges event publishers toward `#[contractevent]`, but Belay's event
// interface is frozen by `docs/AGENT_INTERFACE.md` and by the off-chain decoder:
// several events share one payload struct under different topic symbols, and
// `px_init`/`upgrade`/`migrate` carry tuple payloads. The low-level `publish`
// API is the only one that expresses that interface exactly, so the deprecation
// is allowed here rather than reshaping (and risking) the wire format.
#[allow(deprecated)]
#[contractimpl]
impl BelayContract {
    // ── admin / lifecycle ────────────────────────────────────────────────

    pub fn init(env: Env, admin: Address, vault: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, BelayError::AlreadyInitialized);
        }
        if admin == vault {
            panic_with_error!(&env, BelayError::InvalidActor);
        }

        admin.require_auth();

        env.storage().instance().set(&DataKey::Version, &CONTRACT_VERSION);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Vault, &vault);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        env.events().publish((symbol_short!("px_init"),), CONTRACT_VERSION);
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin = Self::require_admin_at_supported_version(&env);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        env.events().publish(
            (symbol_short!("upgrade"),),
            (CONTRACT_VERSION, admin, env.ledger().timestamp()),
        );
    }

    pub fn migrate(env: Env) {
        let old_version = Self::read_version(&env);
        if old_version == CONTRACT_VERSION {
            return;
        }
        if old_version < MIN_MIGRATABLE_VERSION || old_version > CONTRACT_VERSION {
            panic_with_error!(&env, BelayError::VersionMismatch);
        }

        let admin = Self::require_admin_at_supported_version(&env);
        env.storage().instance().set(&DataKey::Version, &CONTRACT_VERSION);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("migrate"),),
            (old_version, CONTRACT_VERSION, admin, env.ledger().timestamp()),
        );
    }

    pub fn set_vault(env: Env, vault: Address) {
        let admin = Self::require_admin(&env);
        if vault == admin {
            panic_with_error!(&env, BelayError::InvalidActor);
        }

        env.storage().instance().set(&DataKey::Vault, &vault);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("vault_cfg"),),
            ConfigEventV1 {
                version:    CONTRACT_VERSION,
                subject:    vault,
                updated_by: admin,
                timestamp:  env.ledger().timestamp(),
            },
        );
    }

    pub fn get_vault(env: Env) -> Address {
        let vault = Self::read_vault(&env);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);
        vault
    }

    /// Configures the arbitrator that resolves disputed milestones. Until one
    /// is set, only the contract admin can resolve disputes.
    pub fn set_arbitrator(env: Env, arbitrator: Address) {
        let admin = Self::require_admin(&env);
        if arbitrator == admin {
            panic_with_error!(&env, BelayError::InvalidActor);
        }

        env.storage().instance().set(&DataKey::Arbitrator, &arbitrator);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("arb_set"),),
            ConfigEventV1 {
                version:    CONTRACT_VERSION,
                subject:    arbitrator,
                updated_by: admin,
                timestamp:  env.ledger().timestamp(),
            },
        );
    }

    pub fn clear_arbitrator(env: Env) {
        let admin = Self::require_admin(&env);
        env.storage().instance().remove(&DataKey::Arbitrator);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("arb_clr"),),
            ConfigEventV1 {
                version:    CONTRACT_VERSION,
                subject:    admin.clone(),
                updated_by: admin,
                timestamp:  env.ledger().timestamp(),
            },
        );
    }

    pub fn get_arbitrator(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Arbitrator)
    }

    // ── agreement setup ──────────────────────────────────────────────────

    /// Creates the agreement shell. Milestones are added next with
    /// `add_milestone`, in order, until the schedule is complete and the
    /// client funds it.
    pub fn create_agreement(
        env: Env,
        agreement_id: String,
        client: Address,
        freelancer: Address,
        title: String,
    ) {
        Self::require_current_version(&env);

        client.require_auth();

        if client == freelancer {
            panic_with_error!(&env, BelayError::SameParty);
        }
        Self::validate_id(&env, &agreement_id);
        Self::validate_bounded(&env, &title, MAX_TITLE_LEN, BelayError::EmptyId, BelayError::TitleTooLong);

        let key = DataKey::Agreement(agreement_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, BelayError::AgreementExists);
        }

        let agreement = Agreement {
            id:              agreement_id.clone(),
            client:          client.clone(),
            freelancer:      freelancer.clone(),
            title:           title.clone(),
            status:          AgreementStatus::Draft,
            total:           0,
            escrowed:        0,
            released:        0,
            refunded:        0,
            milestone_count: 0,
            created_at:      env.ledger().timestamp(),
            funded_at:       0,
            closed_at:       0,
        };
        Self::write_agreement(&env, &agreement);
        Self::write_milestones(&env, &agreement_id, &Vec::new(&env));

        Self::index_account(&env, &client, true, &agreement_id);
        Self::index_account(&env, &freelancer, false, &agreement_id);

        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("agr_cre"), agreement_id.clone()),
            AgreementCreatedEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                client,
                freelancer,
                title,
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    /// Appends a milestone. Only the client may add; indexes must be
    /// sequential (`0, 1, 2…`) so the schedule is impossible to reorder.
    pub fn add_milestone(
        env: Env,
        agreement_id: String,
        index: u32,
        amount: i128,
        description: String,
        due_at: u64,
    ) {
        Self::require_current_version(&env);
        Self::validate_amount(&env, amount);
        Self::validate_bounded(
            &env,
            &description,
            MAX_DESCRIPTION_LEN,
            BelayError::DescriptionTooLong,
            BelayError::DescriptionTooLong,
        );

        let mut agreement = Self::read_agreement(&env, &agreement_id);
        agreement.client.require_auth();

        if agreement.status != AgreementStatus::Draft {
            panic_with_error!(&env, BelayError::InvalidStatus);
        }
        if agreement.escrowed != 0 {
            // Once any funding lands the schedule is frozen: changing amounts
            // afterwards would break the escrow accounting.
            panic_with_error!(&env, BelayError::InvalidStatus);
        }
        if index != agreement.milestone_count {
            panic_with_error!(&env, BelayError::InvalidMilestoneIndex);
        }
        if index >= MAX_MILESTONES {
            panic_with_error!(&env, BelayError::TooManyMilestones);
        }

        let mut milestones = Self::read_milestones(&env, &agreement_id);
        milestones.push_back(Milestone {
            index,
            amount,
            description:  description.clone(),
            due_at,
            status:       MilestoneStatus::Pending,
            evidence:     String::from_str(&env, ""),
            submitted_at: 0,
            resolved_at:  0,
        });

        agreement.total = agreement
            .total
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, BelayError::AmountTooLarge));
        if agreement.total > MAX_AMOUNT_STROOPS {
            panic_with_error!(&env, BelayError::AmountTooLarge);
        }
        agreement.milestone_count += 1;

        Self::write_agreement(&env, &agreement);
        Self::write_milestones(&env, &agreement_id, &milestones);

        env.events().publish(
            (symbol_short!("mil_add"), agreement_id.clone()),
            MilestoneAddedEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                index,
                amount,
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    /// Funds the agreement by locking `amount` tokens in the vault. Partial
    /// funding is allowed; the agreement flips to `Funded` when the escrowed
    /// total reaches the milestone total.
    pub fn fund_agreement(env: Env, agreement_id: String, amount: i128) {
        Self::require_current_version(&env);
        Self::validate_amount(&env, amount);

        let mut agreement = Self::read_agreement(&env, &agreement_id);
        agreement.client.require_auth();

        if agreement.status != AgreementStatus::Draft {
            panic_with_error!(&env, BelayError::InvalidStatus);
        }
        if agreement.milestone_count == 0 {
            panic_with_error!(&env, BelayError::NoMilestones);
        }
        if agreement.escrowed >= agreement.total {
            panic_with_error!(&env, BelayError::AlreadyFullyFunded);
        }

        let next_escrowed = agreement
            .escrowed
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, BelayError::AmountTooLarge));
        if next_escrowed > agreement.total {
            // Over-funding would lock more than the schedule can ever pay out.
            panic_with_error!(&env, BelayError::AmountTooLarge);
        }

        let vault = Self::vault_client(&env);
        vault.fund(&agreement_id, &agreement.client, &amount);

        agreement.escrowed = next_escrowed;
        let fully_funded = agreement.escrowed == agreement.total;
        if fully_funded {
            agreement.status = AgreementStatus::Funded;
            agreement.funded_at = env.ledger().timestamp();
        }
        Self::write_agreement(&env, &agreement);

        env.events().publish(
            (symbol_short!("agr_fund"), agreement_id.clone()),
            AgreementFundedEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                amount,
                escrowed:     agreement.escrowed,
                fully_funded,
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    // ── milestone lifecycle ──────────────────────────────────────────────

    /// Freelancer marks a milestone delivered, attaching a note or link to
    /// the evidence.
    pub fn submit_milestone(env: Env, agreement_id: String, index: u32, evidence: String) {
        Self::require_current_version(&env);
        Self::validate_bounded(
            &env,
            &evidence,
            MAX_EVIDENCE_LEN,
            BelayError::EvidenceTooLong,
            BelayError::EvidenceTooLong,
        );

        let agreement = Self::read_agreement(&env, &agreement_id);
        agreement.freelancer.require_auth();

        if agreement.status != AgreementStatus::Funded {
            panic_with_error!(&env, BelayError::NotFullyFunded);
        }

        let mut milestones = Self::read_milestones(&env, &agreement_id);
        let mut milestone = Self::milestone_at(&env, &milestones, index);
        if milestone.status != MilestoneStatus::Pending {
            panic_with_error!(&env, BelayError::InvalidStatus);
        }

        milestone.status       = MilestoneStatus::Submitted;
        milestone.evidence     = evidence.clone();
        milestone.submitted_at = env.ledger().timestamp();
        milestones.set(index, milestone);

        Self::write_milestones(&env, &agreement_id, &milestones);
        Self::bump_agreement(&env, &agreement);

        env.events().publish(
            (symbol_short!("mil_sub"), agreement_id.clone()),
            MilestoneSubmittedEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                index,
                evidence,
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    /// Client accepts the submitted milestone. This is the single operation
    /// that moves money: the vault releases the milestone amount to the
    /// freelancer.
    pub fn approve_milestone(env: Env, agreement_id: String, index: u32) {
        Self::require_current_version(&env);

        let mut agreement = Self::read_agreement(&env, &agreement_id);
        agreement.client.require_auth();

        let mut milestones = Self::read_milestones(&env, &agreement_id);
        let mut milestone = Self::milestone_at(&env, &milestones, index);
        if milestone.status != MilestoneStatus::Submitted {
            panic_with_error!(&env, BelayError::InvalidStatus);
        }
        if agreement.escrowed < milestone.amount {
            panic_with_error!(&env, BelayError::InsufficientEscrow);
        }

        let vault = Self::vault_client(&env);
        vault.release(&agreement_id, &agreement.freelancer, &milestone.amount);

        milestone.status      = MilestoneStatus::Released;
        milestone.resolved_at = env.ledger().timestamp();
        milestones.set(index, milestone.clone());

        agreement.escrowed -= milestone.amount;
        agreement.released = agreement
            .released
            .checked_add(milestone.amount)
            .unwrap_or_else(|| panic_with_error!(&env, BelayError::AmountTooLarge));

        Self::write_milestones(&env, &agreement_id, &milestones);
        Self::maybe_complete(&env, &mut agreement);
        Self::write_agreement(&env, &agreement);

        env.events().publish(
            (symbol_short!("mil_appr"), agreement_id.clone()),
            MilestoneApprovedEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                index,
                amount:       milestone.amount,
                freelancer:   agreement.freelancer.clone(),
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    /// Client rejects a submitted milestone. The milestone amount stays
    /// escrowed until the arbitrator (or admin) resolves it.
    pub fn dispute_milestone(env: Env, agreement_id: String, index: u32, reason: String) {
        Self::dispute_internal(&env, agreement_id, index, reason, true);
    }

    /// Freelancer escalates a milestone the client never answers. Same
    /// `Disputed` state and same resolution path as `dispute_milestone`.
    pub fn escalate_milestone(env: Env, agreement_id: String, index: u32, reason: String) {
        Self::dispute_internal(&env, agreement_id, index, reason, false);
    }

    /// Resolves a disputed milestone. The arbitrator resolves when one is
    /// configured; otherwise the contract admin does. `in_freelancer_favor`
    /// chooses whether the milestone pays out or is refunded.
    pub fn resolve_dispute(env: Env, agreement_id: String, index: u32, in_freelancer_favor: bool) {
        Self::require_current_version(&env);

        let resolver = Self::resolve_authority(&env);
        resolver.require_auth();

        let mut agreement = Self::read_agreement(&env, &agreement_id);
        let mut milestones = Self::read_milestones(&env, &agreement_id);
        let mut milestone = Self::milestone_at(&env, &milestones, index);

        if milestone.status != MilestoneStatus::Disputed {
            panic_with_error!(&env, BelayError::NotDisputed);
        }
        if agreement.escrowed < milestone.amount {
            panic_with_error!(&env, BelayError::InsufficientEscrow);
        }

        let vault = Self::vault_client(&env);
        if in_freelancer_favor {
            vault.release(&agreement_id, &agreement.freelancer, &milestone.amount);
            milestone.status = MilestoneStatus::Released;
            agreement.released = agreement
                .released
                .checked_add(milestone.amount)
                .unwrap_or_else(|| panic_with_error!(&env, BelayError::AmountTooLarge));
        } else {
            vault.refund(&agreement_id, &agreement.client, &milestone.amount);
            milestone.status = MilestoneStatus::Refunded;
            agreement.refunded = agreement
                .refunded
                .checked_add(milestone.amount)
                .unwrap_or_else(|| panic_with_error!(&env, BelayError::AmountTooLarge));
        }
        milestone.resolved_at = env.ledger().timestamp();
        milestones.set(index, milestone.clone());

        agreement.escrowed -= milestone.amount;

        Self::write_milestones(&env, &agreement_id, &milestones);
        Self::maybe_complete(&env, &mut agreement);
        Self::write_agreement(&env, &agreement);

        env.events().publish(
            (symbol_short!("mil_res"), agreement_id.clone()),
            MilestoneResolvedEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                index,
                released:     in_freelancer_favor,
                amount:       milestone.amount,
                resolver,
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    /// Client reclaims a milestone the freelancer never submitted once its
    /// deadline has passed. Only `Pending` milestones are eligible.
    pub fn refund_overdue_milestone(env: Env, agreement_id: String, index: u32) {
        Self::require_current_version(&env);

        let mut agreement = Self::read_agreement(&env, &agreement_id);
        agreement.client.require_auth();

        let mut milestones = Self::read_milestones(&env, &agreement_id);
        let mut milestone = Self::milestone_at(&env, &milestones, index);

        if milestone.status != MilestoneStatus::Pending {
            panic_with_error!(&env, BelayError::InvalidStatus);
        }
        if milestone.due_at == 0 || env.ledger().timestamp() < milestone.due_at {
            panic_with_error!(&env, BelayError::NotOverdue);
        }
        if agreement.escrowed < milestone.amount {
            panic_with_error!(&env, BelayError::InsufficientEscrow);
        }

        let vault = Self::vault_client(&env);
        vault.refund(&agreement_id, &agreement.client, &milestone.amount);

        milestone.status      = MilestoneStatus::Refunded;
        milestone.resolved_at = env.ledger().timestamp();
        milestones.set(index, milestone.clone());

        agreement.escrowed -= milestone.amount;
        agreement.refunded = agreement
            .refunded
            .checked_add(milestone.amount)
            .unwrap_or_else(|| panic_with_error!(&env, BelayError::AmountTooLarge));

        Self::write_milestones(&env, &agreement_id, &milestones);
        Self::maybe_complete(&env, &mut agreement);
        Self::write_agreement(&env, &agreement);

        env.events().publish(
            (symbol_short!("mil_ref"), agreement_id.clone()),
            MilestoneRefundedEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                index,
                amount:       milestone.amount,
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    /// Client exits an agreement that has not been delivered on. Refused once
    /// any milestone is `Submitted` or `Disputed` — those must be resolved
    /// first so the freelancer is not cut off mid-review. Every remaining
    /// `Pending` milestone is refunded.
    pub fn cancel_agreement(env: Env, agreement_id: String) {
        Self::require_current_version(&env);

        let mut agreement = Self::read_agreement(&env, &agreement_id);
        agreement.client.require_auth();

        if agreement.status == AgreementStatus::Completed
            || agreement.status == AgreementStatus::Cancelled
        {
            panic_with_error!(&env, BelayError::InvalidStatus);
        }

        let mut milestones = Self::read_milestones(&env, &agreement_id);
        for milestone in milestones.iter() {
            if milestone.status == MilestoneStatus::Submitted
                || milestone.status == MilestoneStatus::Disputed
            {
                panic_with_error!(&env, BelayError::CannotCancel);
            }
        }

        let refundable = agreement.escrowed;
        if refundable > 0 {
            let vault = Self::vault_client(&env);
            vault.refund(&agreement_id, &agreement.client, &refundable);
        }

        for position in 0..milestones.len() {
            let mut milestone = milestones.get(position).unwrap();
            if milestone.status == MilestoneStatus::Pending {
                milestone.status      = MilestoneStatus::Refunded;
                milestone.resolved_at = env.ledger().timestamp();
                milestones.set(position, milestone);
            }
        }

        agreement.escrowed  = 0;
        agreement.refunded = agreement
            .refunded
            .checked_add(refundable)
            .unwrap_or_else(|| panic_with_error!(&env, BelayError::AmountTooLarge));
        agreement.status    = AgreementStatus::Cancelled;
        agreement.closed_at = env.ledger().timestamp();

        Self::write_milestones(&env, &agreement_id, &milestones);
        Self::write_agreement(&env, &agreement);

        env.events().publish(
            (symbol_short!("agr_cnc"), agreement_id.clone()),
            AgreementCancelledEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                refunded:     refundable,
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    // ── reads ────────────────────────────────────────────────────────────

    pub fn has_agreement(env: Env, agreement_id: String) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Agreement(agreement_id))
    }

    pub fn get_agreement(env: Env, agreement_id: String) -> Agreement {
        let agreement = Self::read_agreement(&env, &agreement_id);
        Self::bump_agreement(&env, &agreement);
        agreement
    }

    /// Returns every milestone for an agreement. The schedule is capped at
    /// [`MAX_MILESTONES`], so this stays a bounded read and needs no paging.
    pub fn get_milestones(env: Env, agreement_id: String) -> Vec<Milestone> {
        // Reuse the agreement read so a missing agreement panics consistently.
        let agreement = Self::read_agreement(&env, &agreement_id);
        let milestones = Self::read_milestones(&env, &agreement_id);
        Self::bump_agreement(&env, &agreement);
        Self::bump_milestones(&env, &agreement_id);
        milestones
    }

    pub fn get_client_agreements(
        env: Env,
        client: Address,
        offset: u32,
        limit: u32,
    ) -> AgreementPage {
        Self::page_account(&env, &client, true, offset, limit)
    }

    pub fn get_freelancer_agreements(
        env: Env,
        freelancer: Address,
        offset: u32,
        limit: u32,
    ) -> AgreementPage {
        Self::page_account(&env, &freelancer, false, offset, limit)
    }

    // ── internals ────────────────────────────────────────────────────────

    fn dispute_internal(env: &Env, agreement_id: String, index: u32, reason: String, by_client: bool) {
        Self::require_current_version(env);
        Self::validate_bounded(
            env,
            &reason,
            MAX_REASON_LEN,
            BelayError::ReasonTooLong,
            BelayError::ReasonTooLong,
        );

        let agreement = Self::read_agreement(env, &agreement_id);
        let by = if by_client {
            agreement.client.require_auth();
            agreement.client.clone()
        } else {
            agreement.freelancer.require_auth();
            agreement.freelancer.clone()
        };

        let mut milestones = Self::read_milestones(env, &agreement_id);
        let mut milestone = Self::milestone_at(env, &milestones, index);
        if milestone.status != MilestoneStatus::Submitted {
            panic_with_error!(env, BelayError::InvalidStatus);
        }

        milestone.status = MilestoneStatus::Disputed;
        milestones.set(index, milestone);

        Self::write_milestones(env, &agreement_id, &milestones);
        Self::bump_agreement(env, &agreement);

        env.events().publish(
            (symbol_short!("mil_dsp"), agreement_id.clone()),
            MilestoneDisputedEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                index,
                by,
                reason,
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    /// The arbitrator when configured, otherwise the admin.
    fn resolve_authority(env: &Env) -> Address {
        if let Some(arbitrator) = env.storage().instance().get::<_, Address>(&DataKey::Arbitrator) {
            return arbitrator;
        }
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, BelayError::NotInitialized))
    }

    /// Marks the agreement completed once no milestone can still change.
    fn maybe_complete(env: &Env, agreement: &mut Agreement) {
        let milestones = Self::read_milestones(env, &agreement.id);
        let settled = milestones.iter().all(|m| {
            m.status == MilestoneStatus::Released || m.status == MilestoneStatus::Refunded
        });

        if settled && agreement.status == AgreementStatus::Funded {
            agreement.status    = AgreementStatus::Completed;
            agreement.closed_at = env.ledger().timestamp();

            env.events().publish(
                (symbol_short!("agr_cmp"), agreement.id.clone()),
                AgreementCompletedEventV1 {
                    version:      CONTRACT_VERSION,
                    agreement_id: agreement.id.clone(),
                    released:     agreement.released,
                    refunded:     agreement.refunded,
                    timestamp:    env.ledger().timestamp(),
                },
            );
        }
    }

    fn index_account(env: &Env, account: &Address, as_client: bool, agreement_id: &String) {
        let index_key = if as_client {
            DataKey::ClientIndex(account.clone(), agreement_id.clone())
        } else {
            DataKey::FreelancerIndex(account.clone(), agreement_id.clone())
        };

        if env.storage().persistent().has(&index_key) {
            return;
        }

        let count_key = if as_client {
            DataKey::ClientCount(account.clone())
        } else {
            DataKey::FreelancerCount(account.clone())
        };
        let count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
        let at_key = if as_client {
            DataKey::ClientAt(account.clone(), count)
        } else {
            DataKey::FreelancerAt(account.clone(), count)
        };
        let next = count
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(env, BelayError::IndexOverflow));

        env.storage().persistent().set(&index_key, &count);
        env.storage().persistent().set(&at_key, agreement_id);
        env.storage().persistent().set(&count_key, &next);
        for key in [&count_key, &at_key, &index_key] {
            env.storage()
                .persistent()
                .extend_ttl(key, STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);
        }
    }

    fn page_account(
        env: &Env,
        account: &Address,
        as_client: bool,
        offset: u32,
        limit: u32,
    ) -> AgreementPage {
        if limit == 0 || limit > MAX_PAGE_SIZE {
            panic_with_error!(env, BelayError::InvalidPage);
        }
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        let count_key = if as_client {
            DataKey::ClientCount(account.clone())
        } else {
            DataKey::FreelancerCount(account.clone())
        };

        let mut agreements = Vec::new(env);
        let mut next_offset = None;

        let count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
        if count > 0 {
            env.storage()
                .persistent()
                .extend_ttl(&count_key, STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

            let end = offset.saturating_add(limit).min(count);
            let mut index = offset.min(count);
            while index < end {
                let at_key = if as_client {
                    DataKey::ClientAt(account.clone(), index)
                } else {
                    DataKey::FreelancerAt(account.clone(), index)
                };
                if let Some(id) = env.storage().persistent().get::<_, String>(&at_key) {
                    env.storage()
                        .persistent()
                        .extend_ttl(&at_key, STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);
                    if let Some(agreement) =
                        env.storage().persistent().get::<_, Agreement>(&DataKey::Agreement(id))
                    {
                        agreements.push_back(agreement);
                    }
                }
                index += 1;
            }
            if end < count {
                next_offset = Some(end);
            }
        }

        AgreementPage { agreements, next_offset }
    }

    fn milestone_at(_env: &Env, milestones: &Vec<Milestone>, index: u32) -> Milestone {
        milestones
            .get(index)
            .unwrap_or_else(|| panic_with_error!(_env, BelayError::MilestoneNotFound))
    }

    fn read_agreement(env: &Env, agreement_id: &String) -> Agreement {
        env.storage()
            .persistent()
            .get(&DataKey::Agreement(agreement_id.clone()))
            .unwrap_or_else(|| panic_with_error!(env, BelayError::AgreementNotFound))
    }

    fn write_agreement(env: &Env, agreement: &Agreement) {
        let key = DataKey::Agreement(agreement.id.clone());
        env.storage().persistent().set(&key, agreement);
        env.storage()
            .persistent()
            .extend_ttl(&key, STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);
    }

    fn read_milestones(env: &Env, agreement_id: &String) -> Vec<Milestone> {
        env.storage()
            .persistent()
            .get(&DataKey::Milestones(agreement_id.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn write_milestones(env: &Env, agreement_id: &String, milestones: &Vec<Milestone>) {
        let key = DataKey::Milestones(agreement_id.clone());
        env.storage().persistent().set(&key, milestones);
        env.storage()
            .persistent()
            .extend_ttl(&key, STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);
    }

    fn bump_agreement(env: &Env, agreement: &Agreement) {
        let key = DataKey::Agreement(agreement.id.clone());
        if env.storage().persistent().has(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);
        }
    }

    fn bump_milestones(env: &Env, agreement_id: &String) {
        let key = DataKey::Milestones(agreement_id.clone());
        if env.storage().persistent().has(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);
        }
    }

    fn vault_client(env: &Env) -> EscrowVaultClient<'_> {
        EscrowVaultClient::new(env, &Self::read_vault(env))
    }

    fn read_vault(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Vault)
            .unwrap_or_else(|| panic_with_error!(env, BelayError::NotInitialized))
    }

    fn read_version(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Version)
            .unwrap_or_else(|| panic_with_error!(env, BelayError::NotInitialized))
    }

    fn require_current_version(env: &Env) {
        if Self::read_version(env) != CONTRACT_VERSION {
            panic_with_error!(env, BelayError::VersionMismatch);
        }
    }

    fn require_admin(env: &Env) -> Address {
        Self::require_current_version(env);
        Self::require_admin_at_supported_version(env)
    }

    fn require_admin_at_supported_version(env: &Env) -> Address {
        let version = Self::read_version(env);
        if version < MIN_MIGRATABLE_VERSION || version > CONTRACT_VERSION {
            panic_with_error!(env, BelayError::VersionMismatch);
        }
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, BelayError::NotInitialized));
        admin.require_auth();
        admin
    }

    fn validate_amount(env: &Env, amount: i128) {
        if amount <= 0 {
            panic_with_error!(env, BelayError::InvalidAmount);
        }
        if amount > MAX_AMOUNT_STROOPS {
            panic_with_error!(env, BelayError::AmountTooLarge);
        }
    }

    fn validate_id(env: &Env, id: &String) {
        if id.is_empty() {
            panic_with_error!(env, BelayError::EmptyId);
        }
        if id.len() > MAX_ID_LEN {
            panic_with_error!(env, BelayError::IdTooLong);
        }
    }

    fn validate_bounded(
        env: &Env,
        value: &String,
        max: u32,
        empty_error: BelayError,
        too_long_error: BelayError,
    ) {
        if value.is_empty() {
            panic_with_error!(env, empty_error);
        }
        if value.len() > max {
            panic_with_error!(env, too_long_error);
        }
    }
}

// The test suite lives in a separate module to keep this file readable.
#[cfg(test)]
mod test;
