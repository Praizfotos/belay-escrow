//! Belay contract test suite.
//!
//! The suite is deliberately integration-shaped: a real `EscrowVaultContract`
//! and a real test token are registered alongside `BelayContract`, so every
//! test that moves money exercises the actual cross-contract hop and the
//! vault's controller check rather than a stand-in. Tests that must prove an
//! authorization boundary use `mock_auths` instead of `mock_all_auths`, since
//! `mock_all_auths` authorizes every address and cannot tell an enforced
//! `require_auth()` from a decorative one.

use super::*;
use crate::test_token::{TestToken, TestTokenClient};
use belay_vault::{EscrowVaultContract, EscrowVaultContractClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal, String,
};

const TOTAL: i128 = 1_000_000_000;

struct World<'a> {
    env:         Env,
    belay:       BelayContractClient<'a>,
    belay_id:    Address,
    vault:       EscrowVaultContractClient<'a>,
    vault_id:    Address,
    token:       TestTokenClient<'a>,
    admin:       Address,
    arbitrator:  Address,
    client:      Address,
    freelancer:  Address,
}

/// Registers the full stack and wires belay → vault → token. Auth is mocked
/// globally; tests that care about auth reset it with `mock_auths`.
fn setup() -> World<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let belay_id = env.register(BelayContract, ());
    let vault_id = env.register(EscrowVaultContract, ());
    let token_id = env.register(TestToken, ());

    let belay = BelayContractClient::new(&env, &belay_id);
    let vault = EscrowVaultContractClient::new(&env, &vault_id);
    let token = TestTokenClient::new(&env, &token_id);

    let admin = Address::generate(&env);
    let arbitrator = Address::generate(&env);
    let client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    vault.init_vault(&admin, &belay_id, &token_id);
    belay.init(&admin, &vault_id);

    World {
        env,
        belay,
        belay_id,
        vault,
        vault_id,
        token,
        admin,
        arbitrator,
        client,
        freelancer,
    }
}

/// Creates an agreement with two milestones of half `TOTAL` each and funds it.
fn funded_two_milestone_agreement(w: &World) -> String {
    let id = String::from_str(&w.env, "agr-two");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Design sprint"));
    w.belay.add_milestone(&id, &0, &(TOTAL / 2), &String::from_str(&w.env, "Wireframes"), &0);
    w.belay.add_milestone(&id, &1, &(TOTAL / 2), &String::from_str(&w.env, "High-fidelity mockups"), &0);
    w.token.mint(&w.client, &TOTAL);
    w.belay.fund_agreement(&id, &TOTAL);
    id
}

// ── init / config ────────────────────────────────────────────────────────

#[test]
fn test_init_sets_admin_and_vault() {
    let w = setup();
    assert_eq!(w.belay.get_vault(), w.vault_id);
    assert!(w.belay.get_arbitrator().is_none());
}

#[test]
#[should_panic]
fn test_double_init_rejected() {
    let w = setup();
    w.belay.init(&w.admin, &w.vault_id);
}

#[test]
#[should_panic]
fn test_init_rejects_admin_equal_vault() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(BelayContract, ());
    let client = BelayContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.init(&admin, &admin);
}

#[test]
fn test_set_and_clear_arbitrator() {
    let w = setup();
    w.belay.set_arbitrator(&w.arbitrator);
    assert_eq!(w.belay.get_arbitrator(), Some(w.arbitrator.clone()));
    w.belay.clear_arbitrator();
    assert!(w.belay.get_arbitrator().is_none());
}

#[test]
#[should_panic]
fn test_add_milestone_requires_sequential_index() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-seq");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Seq"));
    // Index 1 before index 0 must be rejected.
    w.belay.add_milestone(&id, &1, &100, &String::from_str(&w.env, "skipped"), &0);
}

#[test]
#[should_panic]
fn test_agreement_id_must_be_unique() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-dup");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Dup"));
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Dup"));
}

#[test]
#[should_panic]
fn test_client_and_freelancer_must_differ() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-same");
    w.belay.create_agreement(&id, &w.client, &w.client, &String::from_str(&w.env, "Same"));
}

#[test]
#[should_panic]
fn test_get_unknown_agreement_panics() {
    let w = setup();
    w.belay.get_agreement(&String::from_str(&w.env, "missing"));
}

#[test]
fn test_has_agreement() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-has");
    assert!(!w.belay.has_agreement(&id));
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Has"));
    assert!(w.belay.has_agreement(&id));
}

// ── funding ──────────────────────────────────────────────────────────────

#[test]
fn test_partial_then_full_funding_flips_status() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-partial");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Partial"));
    w.belay.add_milestone(&id, &0, &TOTAL, &String::from_str(&w.env, "Work"), &0);
    w.token.mint(&w.client, &TOTAL);

    w.belay.fund_agreement(&id, &(TOTAL / 4));
    let mid = w.belay.get_agreement(&id);
    assert_eq!(mid.status, AgreementStatus::Draft);
    assert_eq!(mid.escrowed, TOTAL / 4);
    assert_eq!(w.vault.locked_of(&id), TOTAL / 4);

    w.belay.fund_agreement(&id, &(TOTAL - TOTAL / 4));
    let done = w.belay.get_agreement(&id);
    assert_eq!(done.status, AgreementStatus::Funded);
    assert_eq!(done.escrowed, TOTAL);
    assert_eq!(w.token.balance(&w.vault_id), TOTAL);
}

#[test]
#[should_panic]
fn test_overfunding_rejected() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-over");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Over"));
    w.belay.add_milestone(&id, &0, &TOTAL, &String::from_str(&w.env, "Work"), &0);
    w.token.mint(&w.client, &(TOTAL * 2));
    w.belay.fund_agreement(&id, &(TOTAL + 1));
}

#[test]
#[should_panic]
fn test_funding_without_milestones_rejected() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-noms");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "NoMS"));
    w.token.mint(&w.client, &TOTAL);
    w.belay.fund_agreement(&id, &TOTAL);
}

#[test]
#[should_panic]
fn test_cannot_add_milestone_after_funding() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-freeze");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Freeze"));
    w.belay.add_milestone(&id, &0, &(TOTAL / 2), &String::from_str(&w.env, "A"), &0);
    w.token.mint(&w.client, &TOTAL);
    w.belay.fund_agreement(&id, &(TOTAL / 2));
    w.belay.add_milestone(&id, &1, &(TOTAL / 2), &String::from_str(&w.env, "B"), &0);
}

// ── happy path ───────────────────────────────────────────────────────────

#[test]
fn test_submit_approve_releases_tokens() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);

    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "ipfs://wireframes"));
    let submitted = w.belay.get_milestones(&id).get(0).unwrap();
    assert_eq!(submitted.status, MilestoneStatus::Submitted);

    w.belay.approve_milestone(&id, &0);

    assert_eq!(w.token.balance(&w.freelancer), TOTAL / 2);
    assert_eq!(w.vault.locked_of(&id), TOTAL / 2);
    let agreement = w.belay.get_agreement(&id);
    assert_eq!(agreement.released, TOTAL / 2);
    assert_eq!(agreement.escrowed, TOTAL / 2);
    assert_eq!(agreement.status, AgreementStatus::Funded);

    // Second milestone completes the agreement.
    w.belay.submit_milestone(&id, &1, &String::from_str(&w.env, "ipfs://mockups"));
    w.belay.approve_milestone(&id, &1);

    let completed = w.belay.get_agreement(&id);
    assert_eq!(completed.status, AgreementStatus::Completed);
    assert_eq!(completed.released, TOTAL);
    assert_eq!(completed.escrowed, 0);
    assert_eq!(w.vault.locked_of(&id), 0);
    assert_eq!(w.token.balance(&w.freelancer), TOTAL);
}

#[test]
#[should_panic]
fn test_cannot_approve_pending_milestone() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);
    w.belay.approve_milestone(&id, &0);
}

#[test]
#[should_panic]
fn test_cannot_submit_before_funded() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-unfunded");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Unfunded"));
    w.belay.add_milestone(&id, &0, &TOTAL, &String::from_str(&w.env, "Work"), &0);
    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "too soon"));
}

#[test]
#[should_panic]
fn test_cannot_submit_twice() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);
    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "one"));
    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "two"));
}

// ── disputes ─────────────────────────────────────────────────────────────

#[test]
fn test_dispute_then_resolve_for_freelancer() {
    let w = setup();
    w.belay.set_arbitrator(&w.arbitrator);
    let id = funded_two_milestone_agreement(&w);

    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "evidence"));
    w.belay.dispute_milestone(&id, &0, &String::from_str(&w.env, "not as agreed"));

    assert_eq!(w.belay.get_milestones(&id).get(0).unwrap().status, MilestoneStatus::Disputed);

    w.belay.resolve_dispute(&id, &0, &true);
    assert_eq!(w.token.balance(&w.freelancer), TOTAL / 2);
    let agreement = w.belay.get_agreement(&id);
    assert_eq!(agreement.released, TOTAL / 2);
    assert_eq!(agreement.escrowed, TOTAL / 2);
}

#[test]
fn test_dispute_then_resolve_for_client() {
    let w = setup();
    w.belay.set_arbitrator(&w.arbitrator);
    let id = funded_two_milestone_agreement(&w);

    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "evidence"));
    w.belay.dispute_milestone(&id, &0, &String::from_str(&w.env, "wrong"));
    w.belay.resolve_dispute(&id, &0, &false);

    // Client is made whole for the disputed milestone.
    assert_eq!(w.token.balance(&w.client), TOTAL / 2);
    assert_eq!(w.token.balance(&w.freelancer), 0);
    let agreement = w.belay.get_agreement(&id);
    assert_eq!(agreement.refunded, TOTAL / 2);
    assert_eq!(agreement.escrowed, TOTAL / 2);
}

#[test]
fn test_freelancer_can_escalate_silent_client() {
    let w = setup();
    w.belay.set_arbitrator(&w.arbitrator);
    let id = funded_two_milestone_agreement(&w);
    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "delivered"));
    w.belay.escalate_milestone(&id, &0, &String::from_str(&w.env, "no response"));
    assert_eq!(w.belay.get_milestones(&id).get(0).unwrap().status, MilestoneStatus::Disputed);
}

#[test]
fn test_admin_resolves_when_no_arbitrator() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);
    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "delivered"));
    w.belay.dispute_milestone(&id, &0, &String::from_str(&w.env, "disagree"));
    w.belay.resolve_dispute(&id, &0, &true);
    assert_eq!(w.token.balance(&w.freelancer), TOTAL / 2);
}

#[test]
#[should_panic]
fn test_cannot_resolve_undisputed_milestone() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);
    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "delivered"));
    w.belay.resolve_dispute(&id, &0, &true);
}

// ── refunds & cancellation ───────────────────────────────────────────────

#[test]
fn test_refund_overdue_milestone() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-due");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Due"));
    let due_at = 1_000_000_u64;
    w.belay.add_milestone(&id, &0, &TOTAL, &String::from_str(&w.env, "Deliverable"), &due_at);
    w.token.mint(&w.client, &TOTAL);
    w.belay.fund_agreement(&id, &TOTAL);

    w.env.ledger().with_mut(|l| l.timestamp = due_at + 1);
    w.belay.refund_overdue_milestone(&id, &0);

    assert_eq!(w.token.balance(&w.client), TOTAL);
    assert_eq!(w.vault.locked_of(&id), 0);
    let agreement = w.belay.get_agreement(&id);
    assert_eq!(agreement.refunded, TOTAL);
    assert_eq!(agreement.status, AgreementStatus::Completed);
}

#[test]
#[should_panic]
fn test_refund_overdue_before_deadline_rejected() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-notdue");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "NotDue"));
    w.belay.add_milestone(&id, &0, &TOTAL, &String::from_str(&w.env, "Deliverable"), &1_000_000_u64);
    w.token.mint(&w.client, &TOTAL);
    w.belay.fund_agreement(&id, &TOTAL);
    w.belay.refund_overdue_milestone(&id, &0);
}

#[test]
fn test_cancel_unfunded_agreement() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-cancel");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Cancel"));
    w.belay.add_milestone(&id, &0, &TOTAL, &String::from_str(&w.env, "Work"), &0);
    w.belay.cancel_agreement(&id);
    let agreement = w.belay.get_agreement(&id);
    assert_eq!(agreement.status, AgreementStatus::Cancelled);
    assert_eq!(agreement.escrowed, 0);
}

#[test]
fn test_cancel_funded_no_submissions_refunds_all() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);
    w.belay.cancel_agreement(&id);
    assert_eq!(w.token.balance(&w.client), TOTAL);
    assert_eq!(w.vault.locked_of(&id), 0);
    let agreement = w.belay.get_agreement(&id);
    assert_eq!(agreement.status, AgreementStatus::Cancelled);
    assert_eq!(agreement.refunded, TOTAL);
}

#[test]
fn test_cancel_keeps_released_milestone_and_refunds_remainder() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);
    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "done"));
    w.belay.approve_milestone(&id, &0);
    // Milestone 1 never submitted; the client may still exit.
    w.belay.cancel_agreement(&id);

    assert_eq!(w.token.balance(&w.freelancer), TOTAL / 2);
    assert_eq!(w.token.balance(&w.client), TOTAL / 2);
    let agreement = w.belay.get_agreement(&id);
    assert_eq!(agreement.status, AgreementStatus::Cancelled);
    assert_eq!(agreement.released, TOTAL / 2);
    assert_eq!(agreement.refunded, TOTAL / 2);
}

#[test]
#[should_panic]
fn test_cannot_cancel_with_submitted_milestone() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);
    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "awaiting review"));
    w.belay.cancel_agreement(&id);
}

#[test]
#[should_panic]
fn test_cannot_cancel_twice() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-twice");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Twice"));
    w.belay.add_milestone(&id, &0, &TOTAL, &String::from_str(&w.env, "Work"), &0);
    w.belay.cancel_agreement(&id);
    w.belay.cancel_agreement(&id);
}

#[test]
fn test_get_milestones_returns_schedule() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);
    let milestones = w.belay.get_milestones(&id);
    assert_eq!(milestones.len(), 2);
    assert_eq!(milestones.get(0).unwrap().amount, TOTAL / 2);
    assert_eq!(milestones.get(1).unwrap().index, 1);
}

// ── indexing / pagination ────────────────────────────────────────────────

#[test]
fn test_client_and_freelancer_indexes_are_separate() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);

    let client_page = w.belay.get_client_agreements(&w.client, &0, &MAX_PAGE_SIZE);
    assert_eq!(client_page.agreements.len(), 1);
    assert_eq!(client_page.agreements.get(0).unwrap().id, id);

    let freelancer_page = w.belay.get_freelancer_agreements(&w.freelancer, &0, &MAX_PAGE_SIZE);
    assert_eq!(freelancer_page.agreements.len(), 1);

    // A third party sees nothing.
    let stranger = Address::generate(&w.env);
    assert_eq!(
        w.belay.get_freelancer_agreements(&stranger, &0, &MAX_PAGE_SIZE).agreements.len(),
        0,
    );
}

#[test]
fn test_pagination_reports_next_offset() {
    let w = setup();
    for i in 0..3u32 {
        let id = String::from_str(&w.env, match i {
            0 => "agr-p0",
            1 => "agr-p1",
            _ => "agr-p2",
        });
        w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Paged"));
    }

    let first = w.belay.get_client_agreements(&w.client, &0, &2);
    assert_eq!(first.agreements.len(), 2);
    assert_eq!(first.next_offset, Some(2));

    let second = w.belay.get_client_agreements(&w.client, &first.next_offset.unwrap(), &2);
    assert_eq!(second.agreements.len(), 1);
    assert!(second.next_offset.is_none());
}

#[test]
#[should_panic]
fn test_page_size_bounds_enforced() {
    let w = setup();
    w.belay.get_client_agreements(&w.client, &0, &0);
}

// ── authorization boundaries (real auth) ─────────────────────────────────

/// The freelancer cannot approve their own milestone, even though they can
/// submit it.
#[test]
#[should_panic]
fn test_approve_requires_client_auth() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);
    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "done"));

    w.env.set_auths(&[]);
    w.env.mock_auths(&[MockAuth {
        address: &w.freelancer,
        invoke: &MockAuthInvoke {
            contract: &w.belay_id,
            fn_name:  "approve_milestone",
            args:     (id.clone(), 0_u32).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    w.belay.approve_milestone(&id, &0);
}

/// The client cannot submit milestone work on the freelancer's behalf.
#[test]
#[should_panic]
fn test_submit_requires_freelancer_auth() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);

    w.env.set_auths(&[]);
    w.env.mock_auths(&[MockAuth {
        address: &w.client,
        invoke: &MockAuthInvoke {
            contract: &w.belay_id,
            fn_name:  "submit_milestone",
            args:     (id.clone(), 0_u32, String::from_str(&w.env, "fake")).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    w.belay.submit_milestone(&id, &0, &String::from_str(&w.env, "fake"));
}

/// Funding works under a fully-specified auth tree: the client signs the
/// top-level `fund_agreement`, which authorizes the nested `vault.fund` and
/// the token transfer inside it.
#[test]
fn test_fund_under_explicit_auth_tree() {
    let env = Env::default();
    let belay_id = env.register(BelayContract, ());
    let vault_id = env.register(EscrowVaultContract, ());
    let token_id = env.register(TestToken, ());

    let belay = BelayContractClient::new(&env, &belay_id);
    let vault = EscrowVaultContractClient::new(&env, &vault_id);
    let token = TestTokenClient::new(&env, &token_id);

    let admin = Address::generate(&env);
    let client = Address::generate(&env);
    let freelancer = Address::generate(&env);

    env.mock_all_auths();
    vault.init_vault(&admin, &belay_id, &token_id);
    belay.init(&admin, &vault_id);
    token.mint(&client, &TOTAL);

    let id = String::from_str(&env, "agr-auth");
    belay.create_agreement(&id, &client, &freelancer, &String::from_str(&env, "Auth"));
    belay.add_milestone(&id, &0, &TOTAL, &String::from_str(&env, "Work"), &0);

    env.set_auths(&[]);
    env.mock_auths(&[MockAuth {
        address: &client,
        invoke: &MockAuthInvoke {
            contract: &belay_id,
            fn_name:  "fund_agreement",
            args:     (id.clone(), TOTAL).into_val(&env),
            sub_invokes: &[MockAuthInvoke {
                contract: &vault_id,
                fn_name:  "fund",
                args:     (id.clone(), client.clone(), TOTAL).into_val(&env),
                sub_invokes: &[MockAuthInvoke {
                    contract: &token_id,
                    fn_name:  "transfer",
                    args:     (client.clone(), vault_id.clone(), TOTAL).into_val(&env),
                    sub_invokes: &[],
                }],
            }],
        },
    }]);

    // The vault's controller check is satisfied by the belay contract itself
    // (invocation stack); the client auth above covers its own signature.
    belay.fund_agreement(&id, &TOTAL);
    assert_eq!(vault.locked_of(&id), TOTAL);
}

/// A third party cannot fund an agreement — only its client, who owns the
/// escrow obligation.
#[test]
#[should_panic]
fn test_fund_requires_client_auth() {
    let w = setup();
    let id = String::from_str(&w.env, "agr-third");
    w.belay.create_agreement(&id, &w.client, &w.freelancer, &String::from_str(&w.env, "Third"));
    w.belay.add_milestone(&id, &0, &TOTAL, &String::from_str(&w.env, "Work"), &0);
    w.token.mint(&w.freelancer, &TOTAL);

    w.env.set_auths(&[]);
    w.env.mock_auths(&[MockAuth {
        address: &w.freelancer,
        invoke: &MockAuthInvoke {
            contract: &w.belay_id,
            fn_name:  "fund_agreement",
            args:     (id.clone(), TOTAL).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    w.belay.fund_agreement(&id, &TOTAL);
}

/// A contract that is not the configured controller cannot release vault
/// funds, even if it is a contract address with a valid-looking auth entry.
#[test]
#[should_panic]
fn test_vault_release_rejects_unconfigured_contract() {
    let w = setup();
    let id = funded_two_milestone_agreement(&w);
    let impostor = w.env.register(EscrowVaultContract, ());

    w.env.set_auths(&[]);
    w.env.mock_auths(&[MockAuth {
        address: &impostor,
        invoke: &MockAuthInvoke {
            contract: &w.vault_id,
            fn_name:  "release",
            args:     (id.clone(), w.freelancer.clone(), TOTAL / 2).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    w.vault.release(&id, &w.freelancer, &(TOTAL / 2));
}

// ── versioning ───────────────────────────────────────────────────────────

#[test]
fn test_migrate_is_noop_at_current_version() {
    let w = setup();
    w.belay.migrate();
}

#[test]
#[should_panic]
fn test_upgrade_requires_admin() {
    // A non-admin signature must not be able to authorize an upgrade.
    let w = setup();
    let hash = soroban_sdk::BytesN::from_array(&w.env, &[7u8; 32]);
    let attacker = Address::generate(&w.env);

    w.env.set_auths(&[]);
    w.env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &w.belay_id,
            fn_name:  "upgrade",
            args:     (hash.clone(),).into_val(&w.env),
            sub_invokes: &[],
        },
    }]);
    w.belay.upgrade(&hash);
}
