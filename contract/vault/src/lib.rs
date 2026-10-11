#![no_std]

//! Belay escrow vault — a standalone Soroban contract.
//!
//! The contract body lives in `contract/src/vault.rs` so the unit tests can
//! also compile it as a submodule of the Belay crate. It is pulled in here as
//! the vault wasm's crate root.

#[path = "../../src/vault.rs"]
mod contract;

pub use contract::*;

// `vault.rs`'s own unit tests reference `crate::test_token`; provide it when
// this file is the crate root.
#[cfg(test)]
#[path = "../../src/test_token.rs"]
mod test_token;
