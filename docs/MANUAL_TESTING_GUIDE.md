# Manual Testing Guide

End-to-end checks to run before shipping a build. Automated tests
(`npm test`, `cd contract && cargo test`) cover the pure logic; this covers the
wallet + chain + UI paths a unit test can't.

## Setup
- Wallet extension set to **Testnet**, account funded via
  [Friendbot](https://horizon-testnet.stellar.org/friendbot).
- The escrow token (USDC on testnet) trustline enabled on the paying account —
  the dashboard's **Enable escrow token** action submits the `changeTrust`.
- A second wallet/account to act as the freelancer (or a second browser
  profile) for the counterparty flows.
- App running: `npm run dev`.

## 1. Wallet connect (all supported wallets)
For **each** installed wallet (Freighter, xBull, Lobstr, Rabet):
- [ ] Connect opens the chooser and lists the wallet as **Available**.
- [ ] Selecting it returns your `G…` address; the header shows the truncated key + network.
- [ ] **Reload the page** — you stay connected, and the correct wallet is remembered (sign still routes to the right extension).
- [ ] Disconnect clears the session.

## 2. Create an agreement & milestones
- [ ] Create an agreement with a title, counterparty address, and total.
- [ ] Add several milestones with amounts, descriptions, and optional due dates — amounts recompute and cannot exceed the total.
- [ ] Validation blocks zero/negative amounts, malformed addresses, and an empty schedule.

## 3. Fund the agreement (the core flow)
- [ ] Click **Fund** → wallet prompts to sign → confirm.
- [ ] Status walks through building → signing → submitting → recording.
- [ ] On success you get a **real tx hash**; open it on Stellar Expert and confirm the token moved to the **vault** contract.
- [ ] The agreement flips to **funded**; the vault token balance refreshes within a few seconds.
- [ ] **Reject** the signature → app shows "cancelled", no state change.
- [ ] Fund again → blocked as already funded.
- [ ] Funding without the token trustline shows the "Vault is not initialized" / trustline guidance rather than a raw error.

## 4. Submit & release a milestone
- [ ] As the freelancer, **Submit** a milestone with evidence.
- [ ] Status flips to **submitted**; the client sees it without refresh (with Supabase).
- [ ] As the client, **Approve/release** → sign → confirm.
- [ ] Tokens leave the vault to the freelancer; tx hash verifies on Stellar Expert; milestone flips to **released**.

## 5. Refund, dispute & cancel
- [ ] Move a milestone past its due date, then **refund overdue** → tokens return to the client.
- [ ] Raise a **dispute**; the arbitrator address can **resolve** it to release or refund.
- [ ] **Cancel** an agreement with unspent funds → the remaining balance is refunded; released milestones are unaffected.

## 6. Realtime sync (needs Supabase)
- [ ] Open the same agreement in a second browser/user; a funding, submission, or release in one appears in the other without refresh.

## 7. PWA
- [ ] `npm run build && npm run start`, open in Chrome → install prompt appears; install works and launches standalone with the correct icon.
- [ ] DevTools → Application → Manifest: no errors; maskable icon present.
- [ ] Go offline and navigate → the offline fallback page shows (balances are **not** served stale).
- [ ] Lighthouse PWA audit passes.

## 8. Security headers
- [ ] Load any page, check response headers: `Content-Security-Policy` present with a per-request `nonce`, plus HSTS / X-Frame-Options / nosniff.
- [ ] No CSP violations in the console during normal use (connect wallet, fund, approve, navigate).

## 9. Responsiveness
- [ ] Test at 360px, 768px, 1280px. No horizontal scroll; addresses/hashes truncate; tap targets ≥44px; sticky bars clear the iOS safe area.
