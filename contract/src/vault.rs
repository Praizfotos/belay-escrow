//! Escrow vault.
//!
//! Holds SEP-41 tokens (USDC on testnet by default) locked per agreement and
//! moves them only on commands from the Belay controller contract. The vault
//! is deliberately dumb: it knows nothing about milestones, disputes or
//! approvals. It enforces three things and nothing else:
//!
//! 1. Tokens enter (`fund`) and leave (`release` / `refund`) only when the
//!    controller contract authorizes the invocation. A contract address can
//!    only satisfy `require_auth()` for a call it makes itself — the host
//!    authorizes it from the invocation stack, there is no signature that
//!    produces it — so this check is binding, not decorative.
//! 2. No movement can exceed what is locked for that agreement.
//! 3. The configured token cannot be rotated while any tokens are locked,
//!    so locked accounting can never silently change denomination.
//!
//! This mirrors the role `pool.rs` played in the previous architecture, but
//! with real token custody instead of an internal credit ledger: `fund`
//! pulls tokens from the client into the vault, `release` pays the
//! freelancer, `refund` returns funds to the client.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short,
    token::TokenClient, Address, BytesN, Env, String,
};

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum VaultError {
    AlreadyInitialized = 101,
    NotInitialized     = 102,
    InvalidAmount      = 103,
    InsufficientEscrow = 104,
    BalanceOverflow    = 105,
    VersionMismatch    = 106,
    InvalidActor       = 107,
    AmountTooLarge     = 108,
    TokenInUse         = 109,
    IdTooLong          = 110,
    EmptyId            = 111,
}

#[contracttype]
#[derive(Clone)]
pub struct VaultConfig {
    pub admin:      Address,
    pub controller: Address,
    pub token:      Address,
}

#[contracttype]
pub enum VaultDataKey {
    Version,
    Config,
    /// Tokens locked for one agreement.
    Locked(String),
    /// Global sum of every `Locked` entry; the gate on token rotation.
    TotalLocked,
}

#[contracttype]
#[derive(Clone)]
pub struct VaultConfigEventV1 {
    pub version:     u32,
    pub controller:  Address,
    pub token:       Address,
    pub updated_by:  Address,
    pub timestamp:   u64,
}

#[contracttype]
#[derive(Clone)]
pub struct VaultMoveEventV1 {
    pub version:      u32,
    pub agreement_id: String,
    pub actor:        Address,
    pub amount:       i128,
    pub locked_after: i128,
    pub timestamp:    u64,
}

const LEDGERS_PER_DAY:       u32 = 17_280;
const STORAGE_BUMP_THRESHOLD: u32 = LEDGERS_PER_DAY * 30;
const STORAGE_BUMP_AMOUNT:   u32 = LEDGERS_PER_DAY * 365;
const CONTRACT_VERSION:      u32 = 1;
const MIN_MIGRATABLE_VERSION: u32 = 1;
const MAX_AMOUNT_STROOPS:    i128 = 10_000_000_000_000_000;
const MAX_ID_LEN:            u32 = 64;

#[contract]
pub struct EscrowVaultContract;

// See the note in `lib.rs`: the vault's event topics (`vault_ini`, `vault_cfg`,
// `vlt_fund`, `vlt_rel`, `vlt_ref`) are part of the frozen on-chain interface,
// and the config event is reused across two topic names, so the low-level
// `publish` API is kept deliberately.
#[allow(deprecated)]
#[contractimpl]
impl EscrowVaultContract {
    pub fn init_vault(env: Env, admin: Address, controller: Address, token: Address) {
        if env.storage().instance().has(&VaultDataKey::Config) {
            panic_with_error!(&env, VaultError::AlreadyInitialized);
        }
        if admin == controller || admin == token || controller == token {
            panic_with_error!(&env, VaultError::InvalidActor);
        }

        admin.require_auth();

        let cfg = VaultConfig {
            admin:      admin.clone(),
            controller: controller.clone(),
            token:      token.clone(),
        };

        env.storage().instance().set(&VaultDataKey::Version, &CONTRACT_VERSION);
        env.storage().instance().set(&VaultDataKey::Config, &cfg);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("vault_ini"),),
            VaultConfigEventV1 {
                version:    CONTRACT_VERSION,
                controller,
                token,
                updated_by: admin,
                timestamp:  env.ledger().timestamp(),
            },
        );
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
            panic_with_error!(&env, VaultError::VersionMismatch);
        }

        let admin = Self::require_admin_at_supported_version(&env);
        env.storage().instance().set(&VaultDataKey::Version, &CONTRACT_VERSION);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("migrate"),),
            (old_version, CONTRACT_VERSION, admin, env.ledger().timestamp()),
        );
    }

    pub fn get_config(env: Env) -> VaultConfig {
        let cfg = Self::read_config(&env);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);
        cfg
    }

    /// Re-points the controller. The rotated-out contract immediately loses
    /// the ability to move tokens, because enforcement reads the stored
    /// controller on every call.
    pub fn set_controller(env: Env, new_controller: Address) {
        let mut cfg = Self::read_config(&env);
        cfg.admin.require_auth();

        if new_controller == cfg.admin || new_controller == cfg.token {
            panic_with_error!(&env, VaultError::InvalidActor);
        }

        cfg.controller = new_controller.clone();
        env.storage().instance().set(&VaultDataKey::Config, &cfg);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("vault_cfg"),),
            VaultConfigEventV1 {
                version:    CONTRACT_VERSION,
                controller: new_controller,
                token:      cfg.token,
                updated_by: cfg.admin,
                timestamp:  env.ledger().timestamp(),
            },
        );
    }

    /// Rotates the escrow token. Refused while any tokens are locked: the
    /// `Locked` entries are denominated in the current token, and allowing a
    /// rotation underneath them would leave the vault unable to honour them.
    pub fn set_token(env: Env, new_token: Address) {
        let mut cfg = Self::read_config(&env);
        cfg.admin.require_auth();

        if new_token == cfg.admin || new_token == cfg.controller {
            panic_with_error!(&env, VaultError::InvalidActor);
        }

        let total: i128 = env
            .storage()
            .persistent()
            .get(&VaultDataKey::TotalLocked)
            .unwrap_or(0);
        if total > 0 {
            panic_with_error!(&env, VaultError::TokenInUse);
        }

        cfg.token = new_token.clone();
        env.storage().instance().set(&VaultDataKey::Config, &cfg);
        env.storage()
            .instance()
            .extend_ttl(STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);

        env.events().publish(
            (symbol_short!("vault_cfg"),),
            VaultConfigEventV1 {
                version:    CONTRACT_VERSION,
                controller: cfg.controller,
                token:      new_token,
                updated_by: cfg.admin,
                timestamp:  env.ledger().timestamp(),
            },
        );
    }

    /// Locks `amount` of tokens from `from` for `agreement_id`.
    ///
    /// Requires the controller's authorization (from the invocation stack)
    /// *and* `from`'s own authorization — the controller can never pull
    /// tokens from an address that did not sign for this call.
    pub fn fund(env: Env, agreement_id: String, from: Address, amount: i128) {
        let cfg = Self::read_config(&env);
        Self::validate_move(&env, &agreement_id, amount);

        cfg.controller.require_auth();
        from.require_auth();

        let locked_after = Self::adjust_locked(&env, &agreement_id, amount, true);

        TokenClient::new(&env, &cfg.token).transfer(&from, env.current_contract_address(), &amount);

        env.events().publish(
            (symbol_short!("vlt_fund"), agreement_id.clone()),
            VaultMoveEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                actor:        from,
                amount,
                locked_after,
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    /// Moves locked tokens to `to`. Reserved for milestone releases, where
    /// the controller has already checked the client's approval.
    pub fn release(env: Env, agreement_id: String, to: Address, amount: i128) {
        Self::move_out(&env, agreement_id, to, amount, symbol_short!("vlt_rel"));
    }

    /// Moves locked tokens back to `to` (normally the client). Reserved for
    /// refunds, cancellations and dispute resolutions in the controller's
    /// favour of the client.
    pub fn refund(env: Env, agreement_id: String, to: Address, amount: i128) {
        Self::move_out(&env, agreement_id, to, amount, symbol_short!("vlt_ref"));
    }

    pub fn locked_of(env: Env, agreement_id: String) -> i128 {
        Self::read_config(&env);
        let key = VaultDataKey::Locked(agreement_id);
        let locked: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if env.storage().persistent().has(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);
        }
        locked
    }

    pub fn total_locked(env: Env) -> i128 {
        Self::read_config(&env);
        env.storage()
            .persistent()
            .get(&VaultDataKey::TotalLocked)
            .unwrap_or(0)
    }

    // ── internals ────────────────────────────────────────────────────────

    fn move_out(env: &Env, agreement_id: String, to: Address, amount: i128, topic: soroban_sdk::Symbol) {
        let cfg = Self::read_config(env);
        Self::validate_move(env, &agreement_id, amount);

        // Controller-only: no second signature. The approval that justifies
        // this movement was already checked by the controller, and requiring
        // the freelancer or client here would hand them a veto the escrow
        // state machine does not give them.
        cfg.controller.require_auth();

        let locked_after = Self::adjust_locked(env, &agreement_id, amount, false);

        TokenClient::new(env, &cfg.token).transfer(&env.current_contract_address(), &to, &amount);

        env.events().publish(
            (topic, agreement_id.clone()),
            VaultMoveEventV1 {
                version:      CONTRACT_VERSION,
                agreement_id,
                actor:        to,
                amount,
                locked_after,
                timestamp:    env.ledger().timestamp(),
            },
        );
    }

    fn validate_move(env: &Env, agreement_id: &String, amount: i128) {
        if amount <= 0 {
            panic_with_error!(env, VaultError::InvalidAmount);
        }
        if amount > MAX_AMOUNT_STROOPS {
            panic_with_error!(env, VaultError::AmountTooLarge);
        }
        if agreement_id.is_empty() {
            panic_with_error!(env, VaultError::EmptyId);
        }
        if agreement_id.len() > MAX_ID_LEN {
            panic_with_error!(env, VaultError::IdTooLong);
        }
    }

    fn adjust_locked(env: &Env, agreement_id: &String, amount: i128, increase: bool) -> i128 {
        let key = VaultDataKey::Locked(agreement_id.clone());
        let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);

        let next = if increase {
            current.checked_add(amount)
        } else {
            if current < amount {
                panic_with_error!(env, VaultError::InsufficientEscrow);
            }
            current.checked_sub(amount)
        }
        .unwrap_or_else(|| panic_with_error!(env, VaultError::BalanceOverflow));

        let total_key = VaultDataKey::TotalLocked;
        let total: i128 = env.storage().persistent().get(&total_key).unwrap_or(0);
        let total_next = if increase {
            total.checked_add(amount)
        } else {
            total.checked_sub(amount)
        }
        .unwrap_or_else(|| panic_with_error!(env, VaultError::BalanceOverflow));

        env.storage().persistent().set(&key, &next);
        env.storage()
            .persistent()
            .extend_ttl(&key, STORAGE_BUMP_THRESHOLD, STORAGE_BUMP_AMOUNT);
        env.storage().persistent().set(&total_key, &total_next);

        next
    }

    fn read_config(env: &Env) -> VaultConfig {
        env.storage()
            .instance()
            .get(&VaultDataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, VaultError::NotInitialized))
    }

    fn read_version(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&VaultDataKey::Version)
            .unwrap_or_else(|| panic_with_error!(env, VaultError::NotInitialized))
    }

    fn require_admin_at_supported_version(env: &Env) -> Address {
        let version = Self::read_version(env);
        if version < MIN_MIGRATABLE_VERSION || version > CONTRACT_VERSION {
            panic_with_error!(env, VaultError::VersionMismatch);
        }
        let cfg = Self::read_config(env);
        cfg.admin.require_auth();
        cfg.admin
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::test_token::{TestToken, TestTokenClient};
    use soroban_sdk::{
        testutils::{Address as _, MockAuth, MockAuthInvoke},
        Env, IntoVal,
    };

    /// Registers a vault wired to a test token and a *fake* controller address
    /// (an EOA stand-in). Real controller flows are exercised through
    /// `crate::test` end-to-end.
    macro_rules! setup_vault {
        ($env:ident, $client:ident, $token_client:ident, $admin:ident, $controller:ident) => {
            let $env = Env::default();
            $env.mock_all_auths();
            let vault_id = $env.register(EscrowVaultContract, ());
            let token_id = $env.register(TestToken, ());
            let $client = EscrowVaultContractClient::new(&$env, &vault_id);
            let $token_client = TestTokenClient::new(&$env, &token_id);
            let $admin = Address::generate(&$env);
            let $controller = Address::generate(&$env);
            $client.init_vault(&$admin, &$controller, &token_id);
        };
    }

    #[test]
    fn test_init_and_get_config() {
        setup_vault!(env, vault, _token, admin, controller);
        let cfg = vault.get_config();
        assert_eq!(cfg.admin, admin);
        assert_eq!(cfg.controller, controller);
    }

    #[test]
    #[should_panic]
    fn test_double_init_rejected() {
        setup_vault!(env, vault, _token, admin, controller);
        let token = vault.get_config().token;
        vault.init_vault(&admin, &controller, &token);
    }

    #[test]
    #[should_panic]
    fn test_init_rejects_same_admin_and_controller() {
        let env = Env::default();
        env.mock_all_auths();
        let vault = EscrowVaultContractClient::new(&env, &env.register(EscrowVaultContract, ()));
        let token_id = env.register(TestToken, ());
        let admin = Address::generate(&env);
        vault.init_vault(&admin, &admin, &token_id);
    }

    /// Locking pulls real tokens from the client into the vault and raises
    /// both the per-agreement and the global locked counters.
    #[test]
    fn test_fund_moves_tokens_and_tracks_locks() {
        setup_vault!(env, vault, token, _admin, _controller);
        let client_addr = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-1");

        token.mint(&client_addr, &1_000_000_i128);

        vault.fund(&agreement, &client_addr, &400_000_i128);

        assert_eq!(token.balance(&client_addr), 600_000_i128);
        assert_eq!(token.balance(&vault.address), 400_000_i128);
        assert_eq!(vault.locked_of(&agreement), 400_000_i128);
        assert_eq!(vault.total_locked(), 400_000_i128);
    }

    /// A direct call — no controller anywhere on the invocation stack — must
    /// not be able to lock tokens, even with the payer's full cooperation.
    #[test]
    #[should_panic]
    fn test_fund_without_controller_rejected() {
        setup_vault!(env, vault, token, _admin, controller);
        let payer = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-2");
        token.mint(&payer, &1_000_000_i128);

        env.mock_auths(&[MockAuth {
            address: &payer,
            invoke: &MockAuthInvoke {
                contract: &vault.address,
                fn_name: "fund",
                args: (agreement.clone(), payer.clone(), 400_000_i128).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        vault.fund(&agreement, &payer, &400_000_i128);
    }

    /// The controller alone cannot pull tokens from a payer who did not sign.
    #[test]
    #[should_panic]
    fn test_fund_requires_payer_auth() {
        setup_vault!(env, vault, token, _admin, controller);
        let payer = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-3");
        token.mint(&payer, &1_000_000_i128);

        env.mock_auths(&[MockAuth {
            address: &controller,
            invoke: &MockAuthInvoke {
                contract: &vault.address,
                fn_name: "fund",
                args: (agreement.clone(), payer.clone(), 400_000_i128).into_val(&env),
                sub_invokes: &[],
            },
        }]);

        vault.fund(&agreement, &payer, &400_000_i128);
    }

    /// Controller-only release: tokens move out to the payee, locks drop.
    #[test]
    fn test_release_pays_out_and_unlocks() {
        setup_vault!(env, vault, token, _admin, _controller);
        let payer = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-rel");

        token.mint(&payer, &1_000_000_i128);
        vault.fund(&agreement, &payer, &1_000_000_i128);

        vault.release(&agreement, &freelancer, &600_000_i128);

        assert_eq!(token.balance(&freelancer), 600_000_i128);
        assert_eq!(vault.locked_of(&agreement), 400_000_i128);
        assert_eq!(vault.total_locked(), 400_000_i128);
    }

    /// A release larger than what is locked must not silently overdraw the
    /// vault's own token holdings.
    #[test]
    #[should_panic]
    fn test_release_beyond_lock_rejected() {
        setup_vault!(env, vault, token, _admin, _controller);
        let payer = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-over");

        token.mint(&payer, &500_000_i128);
        vault.fund(&agreement, &payer, &500_000_i128);

        vault.release(&agreement, &freelancer, &500_001_i128);
    }

    /// Direct (non-controller) release is rejected.
    #[test]
    #[should_panic]
    fn test_release_without_controller_rejected() {
        setup_vault!(env, vault, _token, _admin, _controller);
        let freelancer = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-direct");

        env.mock_auths(&[MockAuth {
            address: &freelancer,
            invoke: &MockAuthInvoke {
                contract: &vault.address,
                fn_name: "release",
                args: (agreement.clone(), freelancer.clone(), 100_i128).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        vault.release(&agreement, &freelancer, &100_i128);
    }

    /// Refund follows the same controller-only rule as release.
    #[test]
    fn test_refund_returns_tokens() {
        setup_vault!(env, vault, token, _admin, _controller);
        let payer = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-ref");

        token.mint(&payer, &300_000_i128);
        vault.fund(&agreement, &payer, &300_000_i128);

        vault.refund(&agreement, &payer, &300_000_i128);

        assert_eq!(token.balance(&payer), 300_000_i128);
        assert_eq!(vault.locked_of(&agreement), 0);
        assert_eq!(vault.total_locked(), 0);
    }

    /// Token rotation is frozen while anything is locked, then available
    /// again once the vault empties.
    #[test]
    #[should_panic]
    fn test_set_token_blocked_while_locked() {
        setup_vault!(env, vault, token, _admin, _controller);
        let payer = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-rot");

        token.mint(&payer, &100_i128);
        vault.fund(&agreement, &payer, &100_i128);

        let new_token = env.register(TestToken, ());
        vault.set_token(&new_token);
    }

    #[test]
    fn test_set_token_allowed_when_empty() {
        setup_vault!(env, vault, _token, _admin, _controller);
        let new_token = env.register(TestToken, ());
        vault.set_token(&new_token);
        assert_eq!(vault.get_config().token, new_token);
    }

    /// Rotating the controller actually revokes the old one.
    #[test]
    #[should_panic]
    fn test_rotated_controller_cannot_release() {
        setup_vault!(env, vault, token, _admin, controller);
        let payer = Address::generate(&env);
        let freelancer = Address::generate(&env);
        let new_controller = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-rev");

        token.mint(&payer, &200_i128);
        vault.fund(&agreement, &payer, &200_i128);

        vault.set_controller(&new_controller);

        env.mock_auths(&[MockAuth {
            address: &controller, // the rotated-out controller
            invoke: &MockAuthInvoke {
                contract: &vault.address,
                fn_name: "release",
                args: (agreement.clone(), freelancer.clone(), 200_i128).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        vault.release(&agreement, &freelancer, &200_i128);
    }

    #[test]
    #[should_panic]
    fn test_set_controller_requires_admin() {
        setup_vault!(env, vault, _token, _admin, _controller);
        let attacker = Address::generate(&env);
        env.mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &vault.address,
                fn_name: "set_controller",
                args: (attacker.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }]);
        vault.set_controller(&attacker);
    }

    #[test]
    #[should_panic]
    fn test_fund_rejects_zero_amount() {
        setup_vault!(env, vault, _token, _admin, _controller);
        let payer = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-zero");
        vault.fund(&agreement, &payer, &0);
    }

    #[test]
    #[should_panic]
    fn test_fund_rejects_over_max_amount() {
        setup_vault!(env, vault, _token, _admin, _controller);
        let payer = Address::generate(&env);
        let agreement = soroban_sdk::String::from_str(&env, "agr-max");
        vault.fund(&agreement, &payer, &(MAX_AMOUNT_STROOPS + 1));
    }

    #[test]
    fn test_migrate_from_v1_is_noop_at_current_version() {
        setup_vault!(env, vault, _token, _admin, _controller);
        // Already at v1: migrate is a no-op and must not panic.
        vault.migrate();
    }
}
