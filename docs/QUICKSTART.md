# Quickstart

Get Belay running locally in about five minutes.

Belay is freelancer milestone escrow on Stellar Soroban: a client and a
freelancer agree a milestone schedule, the client funds it with a SEP-41 token
(USDC on testnet by default), and each milestone's tokens are released from a
vault contract when the client approves.

## Prerequisites
- Node.js 18+ and npm 9+
- A Stellar wallet extension set to **Testnet** — [Freighter](https://freighter.app), xBull, Lobstr, or Rabet
- (Optional) A free [Supabase](https://supabase.com) project for cross-device sync
- (Optional, contract work only) Rust toolchain + [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)

## 1. Install
```bash
git clone https://github.com/Praizfotos/belay-escrow.git
cd Belay
npm install
```

## 2. Configure environment
```bash
cp .env.local.example .env.local
```
The Stellar/Soroban testnet values are pre-filled, including the Belay contract
(`NEXT_PUBLIC_CONTRACT_ID`), the escrow vault
(`NEXT_PUBLIC_VAULT_CONTRACT_ID`) and the escrow token
(`NEXT_PUBLIC_ESCROW_TOKEN_ID`). For live sync, add your Supabase URL + anon key
and the server-only secrets from [SUPABASE_SETUP.md](./SUPABASE_SETUP.md). The
app still runs without Supabase, storing your agreements locally in the
browser.

## 3. Fund a testnet wallet
Copy your wallet's public key (starts with `G…`) and fund it so it can pay fees
and hold a token trustline:
```
https://horizon-testnet.stellar.org/friendbot?addr=YOUR_PUBLIC_KEY
```
The escrow token (USDC on testnet) must exist on your account before you can
fund an agreement. The dashboard offers an **Enable escrow token** action that
submits the `changeTrust` for you.

## 4. Run
```bash
npm run dev
```
Open <http://localhost:3000>, connect your wallet, and create your first
agreement.

## 5. Build for production
```bash
npm run build && npm run start
```

## Verify your checkout
```bash
npm run lint
npm run build      # also builds the Serwist service worker
npm test           # Jest unit/integration tests
cd contract && cargo test   # Rust contract tests (optional)
```

## Troubleshooting
- **"remote fetch disabled" on install** — some sandboxes block the JSR-hosted
  wallet kit. Install in a normal environment.
- **Wallet won't connect** — make sure the extension is set to **Testnet**.
- **No balance** — fund the account with Friendbot (step 3).
- **"Vault is not initialized"** — the token trustline is missing, or the vault
  contract address in `.env.local` is wrong. See [RUNBOOK.md](./RUNBOOK.md).
- **Service worker not updating** — hard-reload, or unregister it in DevTools →
  Application → Service Workers. It is disabled in `npm run dev` by design.
