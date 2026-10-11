//! Caller-side interface for the companion [`crate::vault`] escrow contract.
//!
//! Belay never links the vault implementation into its own wasm — the two
//! contracts deploy from separate crates. To invoke the vault it only needs a
//! client, which this `#[contractclient]` trait generates. The function names
//! and argument types mirror `contract/src/vault.rs` exactly.

use soroban_sdk::{contractclient, Address, Env, String};

#[contractclient(name = "EscrowVaultClient")]
pub trait EscrowVaultInterface {
    /// Lock `amount` tokens from `from` for `agreement_id`.
    fn fund(env: Env, agreement_id: String, from: Address, amount: i128);

    /// Release locked tokens for `agreement_id` to `to`.
    fn release(env: Env, agreement_id: String, to: Address, amount: i128);

    /// Refund locked tokens for `agreement_id` to `to`.
    fn refund(env: Env, agreement_id: String, to: Address, amount: i128);
}
