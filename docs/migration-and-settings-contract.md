# Slim AIGC V1: Existing Database and Settings Contract

## Deployment premise

The slim build starts against the existing production database. It does not create a replacement database, import a blank schema, rename existing core tables, or rewrite existing user, token, channel, payment, order, session, log, or option rows.

The application keeps the upstream startup migration sequence and adds only idempotent additive migrations for retained custom features.

## Retained option rows

All existing `options` rows remain in place. The runtime option loader must keep handling the upstream settings plus the retained custom keys below:

| Area | Keys / payload |
| --- | --- |
| EPay / Alipay | `PayAddress`, `CustomCallbackAddress`, `EpayId`, `EpayKey`, `PayMethods`, `Price`, `USDExchangeRate`, `MinTopUp`, `TopupGroupRatio`, `TopUpLink` |
| GMPay crypto | `GMPayAddress`, `GMPayId`, `GMPayKey`, `GMPayPayMethods` |
| Official payment UI | `payment_setting` global-config JSON, Stripe, Creem, Waffo, Waffo Pancake settings and their existing option rows |
| AIGC / channels / access | existing upstream option rows are preserved verbatim; retained custom features only read them |

No option defaults overwrite a row that already exists.

The retained custom top tabs stay external and do not require page/table
migration:

- Contact: `https://api.aizzz.xyz/about`
- Wheelchair setup guide: `https://api.aizzz.xyz/setup-guide`

## Retained tables

### Upstream tables

The official main models continue to own existing core tables, including users, tokens, channels, options, top_ups, subscriptions, auth/session/2FA/passkey tables, tasks, logs and configuration tables.

### Additive custom tables

The slim build registers only the following custom tables through idempotent `AutoMigrate`:

- `channel_monitors`
- `channel_monitor_histories`
- `channel_monitor_daily_rollups`
- `channel_monitor_request_templates`
- `channel_monitor_aggregation_watermarks`
- `affiliate_rebate_records`

Existing Smart Router tables and removed AIGC/canvas-local tables, if present, remain untouched in the database. The slim runtime neither reads nor mutates them.

## Payment routing invariants

1. Existing EPay/Alipay methods remain on the EPay gateway and retain their existing payment method strings, callback route and order rows.
2. GMPay methods use a `gmpay:` client prefix only for new checkout requests. The stored order method remains the raw provider method and the provider is `gmpay`.
3. Existing EPay orders keep `payment_provider = epay`; GMPay callbacks never settle them.
4. Existing GMPay orders keep `payment_provider = gmpay`; EPay callbacks never settle them.
5. Payment callbacks are idempotent and execute in an order-row transaction.
6. The payment settings UI exposes both gateways and persists the exact existing option keys.

## Pre-switch gates

Before changing the production binary:

1. Take a consistent database dump and verify decompression/checksum.
2. Capture table, column, index, row-count, and retained option-key manifests.
3. Run the new binary in an isolated probe against a restored database copy.
4. Compare the post-start schema manifest: only the retained additive tables/indexes may be new; core tables and existing option values must match.
5. Exercise Alipay/EPay and GMPay/USDT checkout creation plus signed callback isolation using fixture merchants.
6. Verify a representative existing user, token, channel, pending top-up, completed top-up, settings page, session, 2FA and passkey row.
7. Switch atomically only after all checks pass; retain a versioned rollback binary and the verified database backup.

## Rollback behavior

Rollback swaps the binary back atomically. Additive tables are not dropped. This keeps both the prior binary and the slim build compatible with the preserved database during the rollback window.
