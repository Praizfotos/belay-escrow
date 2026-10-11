# Wallet Integration

Belay uses the maintained
[`@creit.tech/stellar-wallets-kit`](https://github.com/Creit-Tech/Stellar-Wallets-Kit)
package for wallet discovery, connection UI, address access, and transaction
signing.

The small adapter in
[`lib/stellar/walletsKit.ts`](../lib/stellar/walletsKit.ts) initializes the kit
once with its default modules and preserves the app-facing API used by
`WalletContext` and the transaction helpers. Wallet-specific behavior and the
accessible connection modal remain owned by the upstream package.

The npm distribution is used intentionally, so this project does not need a
JSR registry override in `.npmrc`.

## Default wallet support

`defaultModules()` enables the wallets that require no application-specific
configuration, including Freighter, Albedo, xBull, Lobstr, Rabet, Hana,
Klever, OneKey, Bitget, Fordefi, Cactus Link, D'CENT, Scopuly, MetaMask Stellar,
and Ghost.

The selected wallet ID is stored under `belay:walletId`. On reload, Belay
selects that module before reconciling the saved account, ensuring subsequent
signing requests go back to the wallet the user connected.

## What signing is used for

Belay never asks a wallet to move funds directly. Every on-chain action is a
Soroban contract invocation, and the wallet signs the resulting transaction
envelope:

- `create_agreement` / `add_milestone` — the client lays out the schedule.
- `fund_agreement` — the client's token is transferred into the escrow vault.
- `submit_milestone` — the freelancer attaches evidence.
- `approve_milestone` / `resolve_dispute` / `refund_overdue_milestone` — release
  or return tokens from the vault.
- `cancel_agreement` — refunds whatever is still locked.

Because the vault moves a real SEP-41 token (USDC on testnet by default), the
payer's account needs a trustline for that token before funding. The dashboard
exposes an **Enable escrow token** action for the `changeTrust` operation.

## Passkey smart wallets

For users without a Stellar wallet, a passkey-based Soroban smart wallet is a
separate onboarding path. See the product roadmap in
[`PRODUCT_CONVERSION_GUIDE.md`](./PRODUCT_CONVERSION_GUIDE.md).
