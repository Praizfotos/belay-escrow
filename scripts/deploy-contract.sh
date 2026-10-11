#!/usr/bin/env bash
# =============================================================================
# deploy-contract.sh
#
# Builds and deploys BOTH Belay Soroban contracts to Stellar:
#   1. belay-contract (contract/belay) — agreements, milestones, approvals,
#      disputes. WASM artifact: belay_contract.wasm
#   2. belay-vault    (contract/vault) — custody of the SEP-41 token, releases
#      and refunds. WASM artifact: belay_vault.wasm
#
# The crates live in one cargo workspace (contract/Cargo.toml, members
# `belay` + `vault`), so a single `stellar contract build` produces both WASM
# artifacts under contract/target/wasm32v1-none/release/.
#
# Prerequisites:
#   - Rust toolchain with the wasm32v1-none target (see contract/rust-toolchain.toml)
#       rustup target add wasm32v1-none
#   - Stellar CLI (recent)
#       cargo install --locked stellar-cli
#   - A funded testnet account (get test XLM at friendbot.stellar.org)
#
# Usage:
#   chmod +x scripts/deploy-contract.sh
#   ./scripts/deploy-contract.sh <SECRET_KEY_OR_ALIAS> <ESCROW_TOKEN_ID>
#
#   ESCROW_TOKEN_ID is the SEP-41 token the vault custodies. On testnet use the
#   USDC Stellar Asset Contract (SAC) address, e.g.
#   CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
#
# After a successful deployment, copy the printed addresses into .env.local:
#   NEXT_PUBLIC_CONTRACT_ID=<belay>
#   NEXT_PUBLIC_VAULT_CONTRACT_ID=<vault>
#   NEXT_PUBLIC_ESCROW_TOKEN_ID=<token>
# =============================================================================

set -euo pipefail

ACCOUNT="${1:-}"
TOKEN_ID="${2:-}"

if [[ -z "$ACCOUNT" || -z "$TOKEN_ID" ]]; then
  echo "❌  Usage: $0 <secret-key-or-stellar-cli-alias> <escrow-token-contract-id>"
  echo "   Example: $0 my-testnet-key CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
  exit 1
fi

NETWORK="${STELLAR_NETWORK:-testnet}"

# One workspace build produces one WASM per crate; the artifact names derive
# from the crate package names (belay-contract → belay_contract.wasm).
BUILD_DIR="contract/target/wasm32v1-none/release"
BELAY_WASM="${BELAY_WASM:-$BUILD_DIR/belay_contract.wasm}"
VAULT_WASM="${VAULT_WASM:-$BUILD_DIR/belay_vault.wasm}"

# Resolve the admin public address from either a CLI alias or a raw secret key.
resolve_admin() {
  if [[ "$ACCOUNT" == S* && ${#ACCOUNT} -eq 56 ]]; then
    stellar keys add belay-deployer --secret-key "$ACCOUNT" --overwrite >/dev/null 2>&1
    stellar keys address belay-deployer
  else
    stellar keys address "$ACCOUNT"
  fi
}

ADMIN_ADDRESS="$(resolve_admin)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Belay Contract Deployment"
echo "  Network : Stellar ${NETWORK}"
echo "  Admin   : $ADMIN_ADDRESS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Step 1: Build both crates ────────────────────────────────────────────────
echo "▸ Building contracts (release, workspace: belay-contract + belay-vault)…"
stellar contract build \
  --manifest-path contract/Cargo.toml \
  --optimize

for wasm in "$BELAY_WASM" "$VAULT_WASM"; do
  if [[ ! -f "$wasm" ]]; then
    echo "  ✗ Expected artifact not found: $wasm"
    echo "    Check that the workspace crates are still named belay-contract / belay-vault."
    exit 1
  fi
done
echo "  ✓ Build succeeded: $BELAY_WASM"
echo "                     $VAULT_WASM"
echo ""

# ── Step 2: Deploy the Belay agreement contract ──────────────────────────────
echo "▸ Deploying Belay agreement contract (belay-contract)…"
BELAY_CONTRACT_ID=$(stellar contract deploy \
  --wasm "$BELAY_WASM" \
  --source-account "$ACCOUNT" \
  --network "$NETWORK" \
  --inclusion-fee 1000000)
echo "  ✓ Belay contract: $BELAY_CONTRACT_ID"
echo ""

# ── Step 3: Deploy the escrow vault contract ─────────────────────────────────
echo "▸ Deploying escrow vault contract (belay-vault)…"
VAULT_CONTRACT_ID=$(stellar contract deploy \
  --wasm "$VAULT_WASM" \
  --source-account "$ACCOUNT" \
  --network "$NETWORK" \
  --inclusion-fee 1000000)
echo "  ✓ Vault contract: $VAULT_CONTRACT_ID"
echo ""

# ── Step 4: Initialize the vault (admin, controller, token) ──────────────────
# Order matters: the vault is initialized FIRST, because the Belay contract's
# init stores the vault address, and the Belay contract is the vault's
# controller — only it may release or refund, which is what keeps custody and
# milestone rules in a single authorization path.
echo "▸ Initializing vault (init_vault: admin, controller=Belay, token)…"
stellar contract invoke \
  --id "$VAULT_CONTRACT_ID" \
  --source-account "$ACCOUNT" \
  --network "$NETWORK" \
  -- init_vault \
  --admin "$ADMIN_ADDRESS" \
  --controller "$BELAY_CONTRACT_ID" \
  --token "$TOKEN_ID"
echo "  ✓ Vault initialized"
echo ""

# ── Step 5: Initialize the Belay contract (admin, vault) ─────────────────────
echo "▸ Initializing Belay contract (init: admin, vault)…"
stellar contract invoke \
  --id "$BELAY_CONTRACT_ID" \
  --source-account "$ACCOUNT" \
  --network "$NETWORK" \
  -- init \
  --admin "$ADMIN_ADDRESS" \
  --vault "$VAULT_CONTRACT_ID"
echo "  ✓ Belay contract initialized"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Deployment successful!"
echo ""
echo "  Add these to your .env.local:"
echo "  NEXT_PUBLIC_CONTRACT_ID=$BELAY_CONTRACT_ID"
echo "  NEXT_PUBLIC_VAULT_CONTRACT_ID=$VAULT_CONTRACT_ID"
echo "  NEXT_PUBLIC_ESCROW_TOKEN_ID=$TOKEN_ID"
echo ""
echo "  Verify on Stellar Expert:"
echo "  https://stellar.expert/explorer/${NETWORK}/contract/$BELAY_CONTRACT_ID"
echo "  https://stellar.expert/explorer/${NETWORK}/contract/$VAULT_CONTRACT_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
