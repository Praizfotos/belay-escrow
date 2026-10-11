//! Minimal SEP-41-shaped token used only by the unit test suites.
//!
//! Not compiled into the production WASM: the vault talks to whichever real
//! token contract its admin configured (USDC's Stellar Asset Contract on
//! testnet). This stand-in implements the two functions the vault actually
//! calls — `transfer` and `balance` — plus an open `mint` so tests can mint
//! escrow funding without an admin ceremony.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum TestTokenError {
    InsufficientBalance = 1,
    InvalidAmount       = 2,
    InvalidActor        = 3,
}

#[contracttype]
pub enum TestTokenDataKey {
    Balance(Address),
}

#[contract]
pub struct TestToken;

#[contractimpl]
impl TestToken {
    pub fn mint(env: Env, to: Address, amount: i128) {
        if amount <= 0 {
            panic_with_error!(&env, TestTokenError::InvalidAmount);
        }
        let key = TestTokenDataKey::Balance(to);
        let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(current + amount));
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        if amount <= 0 {
            panic_with_error!(&env, TestTokenError::InvalidAmount);
        }
        from.require_auth();

        let from_key = TestTokenDataKey::Balance(from.clone());
        let from_balance: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
        if from_balance < amount {
            panic_with_error!(&env, TestTokenError::InsufficientBalance);
        }
        env.storage().persistent().set(&from_key, &(from_balance - amount));

        let to_key = TestTokenDataKey::Balance(to.clone());
        let to_balance: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
        env.storage().persistent().set(&to_key, &(to_balance + amount));
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&TestTokenDataKey::Balance(id))
            .unwrap_or(0)
    }
}
