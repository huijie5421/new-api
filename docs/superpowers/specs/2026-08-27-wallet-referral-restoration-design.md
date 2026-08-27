# Wallet Referral Restoration Design

## Goal

Restore the pre-refactor referral experience without reintroducing unrelated legacy wallet code. The wallet must show the full referral program card in the right column, above subscription plans, and its invite total must come from the current referral relationship rows rather than the stale denormalized counter.

## User experience

- Keep the current recharge, payment, redemption-shop, and wallet visual structure.
- Replace the compact referral strip below the wallet with the former full referral card.
- On wide layouts, place the card to the right of recharge and directly above subscription plans.
- On narrow layouts, keep normal document flow: recharge, referral, subscription.
- Restore the rebate-history dialog with separate rebate-record and invitee tabs.

## Data and API behavior

- Restore authenticated endpoints `GET /api/user/aff/rebate` and `GET /api/user/aff/invitees`.
- Continue using the retained `affiliate_rebate_records` ledger and `users.inviter_id` relationship.
- Return `aff_count` from a live count of non-deleted users whose `inviter_id` matches the current user.
- Refresh the legacy `users.aff_count` compatibility field after future invited-user creation, independent of whether signup rewards are enabled. Reward credits remain subject to the existing payment-compliance and quota settings.
- Do not bulk-rewrite historical production counters during deployment; the displayed total is correct immediately because it uses the relationship query.

## Compatibility and deployment

- No schema changes are required.
- Existing sessions and API tokens remain valid.
- Release as `aizzz-gateway-slim-20260825.11`, with a database backup, binary rollback copy, and one-command rollback to `.10`.

