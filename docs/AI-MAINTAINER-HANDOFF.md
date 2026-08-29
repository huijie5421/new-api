# AI Maintainer Handoff

This file is the entry point for another AI or engineer continuing the slim
gateway. Read it before changing code or production state. Detailed history is
linked rather than duplicated where possible.

## Current baseline

| Item | Current value |
| --- | --- |
| Source repository | `/home/huiji/code/Api/new-api-slim-aigc-v1-20260825` |
| Branch | `codex/slim-aigc-v1` |
| Latest functional source commit | `afeada13` (JSON response-format compatibility) |
| Production runtime source commit | `afeada13` |
| Production release | `aizzz-gateway-slim-20260825.19` (deployed `20260829T100738Z`) |
| Official base | `v1.0.0-rc.25`, commit `f116414284162ad15d8925f7bca494c109b83e93` |
| Runtime base marker | `official-v1.0.0-rc.25-f116414 (main-2d8e50bf)` |
| Production binary SHA-256 | `96b926c471820b1374a7ff9f621b2b445638ec17a01e8d79c9b979bdacfeae62` |
| Deployment timestamp | `.19` deployed `20260829T100738Z` UTC |
| Next release label | `.20` unless the operator specifies another label |

Production runs functional commit `afeada13`. The `.09` Apple-style UI
refresh remains a historical rolled-back release and must not be reused without
operator approval. Always verify the actual branch tip with `git rev-parse
--short HEAD`. Source-level reference tags include
`release/aizzz-gateway-slim-20260825.19` (`afeada13`), `.18` (`97b47c83`), `.17` (`8c402cf5`), `.16` (`d7392d15`), the prior `.15`, `.14`, `.13`, `.12`, `.11`, `.10`, `.09`,
and `.08` release/rollback markers.

## Source of truth

Read these files in order:

1. `/home/huiji/code/Api/new-api-slim-aigc-v1-20260825/AGENTS.md`
2. `/home/huiji/code/Api/new-api-slim-aigc-v1-20260825/web/AGENTS.md` for frontend work
3. `/home/huiji/code/Api/new-api-slim-aigc-v1-20260825/docs/SLIM-OFFICIAL-BASE.md`
4. `/home/huiji/code/Api/new-api-slim-aigc-v1-20260825/docs/migration-and-settings-contract.md`
5. `/home/huiji/code/Api/progress.md` for implementation and acceptance history
6. `/home/huiji/code/Api/SERVER-OPS.md` for production and rollback records
7. Relevant plans under `/home/huiji/code/Api/new-api-slim-aigc-v1-20260825/docs/superpowers/plans/`

Git history is authoritative for code. Production state must be checked
read-only before assuming that a recorded deployment is still current.

## Intended product scope

### Retained and maintained

- The official rc.25 authentication stack: short-lived Access JWTs, HttpOnly
  Refresh Cookies, login-session management/revocation, 2FA, Passkeys, and user
  security-version controls. Do not add another parallel authentication model.
- Direct compatibility with the existing production database and option rows.
- AIGC Workshop image/video flows, including owned asset handling and reference
  images relayed as multipart image edits.
- Channel Monitor V1 reproduced from the retained Sub2API behavior, including
  OpenAI-compatible Grok probes. Channel Monitor V2 is outside scope.
- Alipay/EPay and GMPay USDT/USDC checkout/callback paths.
- Invitation-rebate extension, CC Switch-compatible balance endpoints, and USD
  quota conversion fields.
- Cache accounting and the per-request cache-hit-rate badge between Tokens and
  Cost: green at `>=70%`, yellow at `>=50%`, red below `50%`.
- Top navigation entries for Console, AIGC Workshop, Contact Us (`/about`), and
  Wheelchair Setup Guide (`/setup-guide`) according to their module settings.
- The wallet redemption-code shop embedded from
  `https://catfk.com/shop/WWADEZ6N`, with a secure new-tab maximize action.

### Intentionally retired or reduced

- The public Home/landing page. `/` and legacy `/home` go to `/dashboard`;
  signed-out users use the official sign-in guard. Old `home: true` navigation
  settings are forced off, and the administrator Home switch is removed.
- Wireless canvas, e-commerce image sets, and prompt library are placeholders
  only and must not regain their former implementation without a new operator
  decision.
- Channel Monitor V2 and old custom authentication/session extensions.

## Important recent fixes

- `f5a0c48a`: Apple-style UI refresh — split sign-in with business branding,
  upgraded default design tokens, model plaza cards, frosted console header.
- `080b678e`: removed Home navigation and made `/` default to the console.
- `c90f0670`: materialized owned reference assets and converted AIGC image-edit
  references to replayable multipart files.
- `164eeef8`: embedded the wallet redemption-code shop.
- `28ad8c3e`: stopped forcing the unsupported GPT Image 2
  `input_fidelity=low` field.
- `918681d9`: fixed AIGC wallet quota ownership and kept the top navigation in
  the Workshop while hiding the console sidebar.
- `850e89a3`: aligned channel routes, localized V1 monitoring, and added Grok
  monitoring behavior.
- `da415a3b`: restored payment handoff, navigation compatibility, and cache
  metrics.

Use `git show <commit>` instead of reconstructing these fixes from summaries.

## 2026-08-26 - V1 独立渠道监控生图检测（源码未部署）

- Source commits: `3cc1d544` (Go API mode, validation, templates, OpenAI/Grok image adapter), `08c28de8` (rebuilds system-managed request bodies when an API mode changes), `1100bbda`/`33f2b9ef` (frontend timing, status colors, boundary tests), and `5d488d2e` (lint/format cleanup for the touched monitor UI).
- The official rc.25 database schema remains compatible; `ChannelMonitor.APIMode` already uses a varchar field, so no migration is required.
- New mode: `image_generation`, available for OpenAI and Grok independent monitor tasks. It POSTs to `/v1/images/generations`, validates a 2xx JSON response with a non-empty `data[0].url` or `data[0].b64_json`, and never downloads the image.
- New task defaults are interval `300s` and timeout `90s`; image timeout can be edited from `1–180s`, while text probes retain the existing `60s/10s` defaults and `60s` cap. Custom image fields such as prompt, n, size, quality, and response_format remain editable; model is always taken from the task.
- Image status presentation: success latency `<60,000ms` is green, success latency `>=60,000ms` is amber/yellow, and every failure is red. Text mode colors and availability calculations remain unchanged.
- Admin forms, template manager, apply picker, run result, history, public status cards, and public timeline all expose/localize the new mode. Existing templates are not overwritten; OpenAI/Grok image defaults are seeded idempotently.
- Verification completed: targeted Go tests, `go test ./... -count=1`, `go build -buildvcs=false`, frontend typecheck, production build, full Vitest suite (51 files / 234 tests after reverting the rejected UI), changed-file formatting/lint, and `git diff --check`. The repository-wide format check still lists unrelated pre-existing files; no new test failure occurred in the focused suite.
- Release `.10` was deployed after the source-only verification. Production now runs `aizzz-gateway-slim-20260825.10`; the `.08` binary is preserved as the one-click rollback target. The deployment created a MySQL snapshot and did not refresh/revoke login sessions or mutate API tokens.

### `.10` deployment evidence (2026-08-26T16:40:05Z)

- Release binary: `/opt/new-api/releases/aizzz-gateway-slim-20260825-10-b5016156/new-api`, 131674377 bytes, SHA-256 `798aa1eede998d2689bc0423b1e003258495198311eabff215759eb3598ef330`.
- Production `/api/status` and public status both report `aizzz-gateway-slim-20260825.10` and the official rc.25 source marker. Service is `active`, `Result=success`, `NRestarts=0`, failed units `0`, and post-start critical-log scan is clean.
- Public main JS/CSS assets were hash-verified; OpenAI/Grok image-generation templates exist in the live database with `{"n":1,"size":"1024x1024"}`.
- One-click rollback: `/backup/newapi/deployments/20260826T164005Z-before-aizzz-gateway-slim-20260825-10/rollback.sh` (run with `bash` because `/backup` is mounted no-exec). Rollback binary SHA-256 `a56407328aee76bfe3fd0d9cb958224987f3ca0e802f0fb1a79b04167e38602d`; database backup is `newapi.sql.zst` in the same directory and passed `zstd -t`/SHA verification.
- Session/token counts remained unchanged: 310 active sessions and 2810 API tokens before and after deployment.

## Production and rollback

Production access uses the existing SSH alias `sever`. Do not place passwords,
API keys, cookies, merchant secrets, or private keys in commits or handoff
documents.

Current release path (production runs `.16` at `/opt/new-api/current/new-api`;
the `.15` rollback target and earlier releases remain at):

```text
/opt/new-api/releases/aizzz-gateway-slim-20260825-16-d7392d15/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-18-97b47c83/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-17-8c402cf5/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-19-afeada13/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-15-33405846/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-14-5bfeb985/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-13-f2984507/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-12-e80d435f/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-11-dc2da444/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-10-b5016156/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-08-080b678e/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-09-f5a0c48a/new-api  (rolled back, do not reuse without operator approval)
```

One-click rollback to `.18` (from the running `.19`):

```bash
ssh sever 'bash /backup/newapi/deployments/20260829T100738Z-before-aizzz-gateway-slim-20260825-19/rollback.sh'
```

Core database snapshots:

```text
/backup/newapi/deployments/20260826T065012Z-before-aizzz-gateway-slim-20260825-08/newapi.sql.zst
/backup/newapi/deployments/20260826T081803Z-before-aizzz-gateway-slim-20260825-09/newapi.sql.zst
/backup/newapi/deployments/20260826T164005Z-before-aizzz-gateway-slim-20260825-10/newapi.sql.zst
/backup/newapi/deployments/20260827T033311Z-before-aizzz-gateway-slim-20260825-11/newapi.sql.zst
/backup/newapi/deployments/20260827T062919Z-before-aizzz-gateway-slim-20260825-12/newapi.sql.zst
/backup/newapi/deployments/20260828T033826Z-before-aizzz-gateway-slim-20260825-13/newapi.sql.zst
/backup/newapi/deployments/20260828T060400Z-before-aizzz-gateway-slim-20260825-14/newapi.sql.zst
/backup/newapi/deployments/20260828T101303Z-before-aizzz-gateway-slim-20260825-15/newapi.sql.zst
/backup/newapi/deployments/20260828T122250Z-before-aizzz-gateway-slim-20260825-16/newapi.sql.zst
```

Deployment scripts:

```text
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-08.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-09.sh  (deployed then rolled back)
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-10.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-11.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-12.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-13.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-14.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-15.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-16.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-17.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-18.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-19.sh
/root/deploy-aizzz-gateway-slim-20260825-16.sh
/root/deploy-aizzz-gateway-slim-20260825-18.sh
/root/deploy-aizzz-gateway-slim-20260825-19.sh
```

Neither the `.09` deployment nor its rollback refreshed or revoked sessions;
the `.09` deploy snapshot recorded 137 active login sessions and 2794 API
tokens unchanged. These counts are historical evidence, not future expected
constants.

## First-session checklist

Run ordinary commands in WSL Bash. Start with read-only inspection:

```bash
cd /home/huiji/code/Api/new-api-slim-aigc-v1-20260825
cat AGENTS.md
cat web/AGENTS.md
git status --short
git branch --show-current
git log --oneline -15
sed -n '1,220p' docs/SLIM-OFFICIAL-BASE.md
sed -n '1,280p' docs/migration-and-settings-contract.md
tail -180 /home/huiji/code/Api/progress.md
tail -140 /home/huiji/code/Api/SERVER-OPS.md
```

Confirm production without mutating it:

```bash
ssh sever 'set -e; /opt/new-api/current/new-api --version; sha256sum /opt/new-api/current/new-api; systemctl is-active new-api; systemctl show new-api -p Result --value; curl -fsS http://127.0.0.1:3000/api/status'
```

Before editing, report the observed source HEAD, working-tree state, production
version/hash, official base, affected feature, and proposed verification plan.
Do not deploy merely because local tests pass; deployment remains a distinct
operator decision unless the current request explicitly includes it.

## Development and verification rules

- Preserve existing database compatibility across SQLite, MySQL, and
  PostgreSQL and follow the project database rules in `AGENTS.md`.
- Reproduce bugs with a failing regression test before implementing a fix.
- For frontend changes, use Bun and run affected tests, changed-file lint,
  formatting, `bun run typecheck`, the full frontend suite, and a production
  build.
- For backend changes, run targeted tests and `go test ./... -count=1`. If
  `relaykit` changes, also run `cd relaykit && GOWORK=off go build ./...`.
- Keep the existing release naming and create a verified one-click rollback
  before each production switch.
- Never restore removed features or replace official authentication with old
  custom code merely because it still exists in historical commits or database
  tables.
- Append completed implementation/deployment evidence to
  `/home/huiji/code/Api/progress.md` and production procedures to
  `/home/huiji/code/Api/SERVER-OPS.md`.

As of this handoff, frontend typecheck, 53 test files / 238 tests, production
build, full Go tests, changed-file lint/format, and `git diff --check` pass. The
repository-wide frontend format check still lists pre-existing unrelated files;
keep every newly changed file clean and do not silently reformat unrelated
areas.

## Ready-to-use prompt for the next AI

```text
继续维护 slim gateway。首先只读检查，不要立即修改或部署。

仓库：/home/huiji/code/Api/new-api-slim-aigc-v1-20260825
分支：codex/slim-aigc-v1
交接入口：docs/AI-MAINTAINER-HANDOFF.md

依次读取仓库根 AGENTS.md、web/AGENTS.md、交接文档、
docs/SLIM-OFFICIAL-BASE.md、docs/migration-and-settings-contract.md，
再查看最近 15 条 Git 提交、/home/huiji/code/Api/progress.md 和
/home/huiji/code/Api/SERVER-OPS.md 的最新部分。

随后只读核验生产 /opt/new-api/current/new-api 的版本、SHA-256、
new-api.service 状态和 /api/status。先向我汇报源码 HEAD、工作树、
生产版本、官方基础版本、当前保留/移除范围与下一步计划，再处理我
的新需求。沿用官方认证与现有数据库；不要从旧二开版本重新搬运已
移除功能；没有明确部署要求时只完成源码和验证。
```

## Slim gateway `.11` deployment: wallet referral restoration and live invite counts (2026-08-27)

- Restored the pre-refactor full referral program card in the wallet's right column, directly above subscription plans; the compact standalone strip was removed. Rebate history now has the former two-tab dialog (rebate ledger and invited users) with paginated authenticated APIs.
- Restored `GET /api/user/aff/rebate` and `GET /api/user/aff/invitees`, and restored rebate settings in `/api/status` so the wallet can show the configured ratio. No schema migration was required; the retained `affiliate_rebate_records` table and `users.inviter_id` relation are used.
- `GetSelf` now reports a live count of non-deleted users with `inviter_id=<current user>`, so stale `users.aff_count` values no longer reach the wallet. Future signup/OAuth completion refreshes the compatibility counter independently of optional reward/compliance gates; reward crediting remains gated as before. Production data was not bulk-rewritten.
- Source commit/tag: `dc2da444`, `release/aizzz-gateway-slim-20260825.11`; official base marker remains `official-v1.0.0-rc.25-f116414 (main-2d8e50bf)`.
- Release binary: `/opt/new-api/releases/aizzz-gateway-slim-20260825-11-dc2da444/new-api`, 131637410 bytes, SHA-256 `bd0fcabe7926c5c6a2e06101f264b28b74391f3aca7f15883208858b7e476e6b`.
- Deployed at `20260827T033311Z` UTC. Local and public status report `.11`; service is `active`, `Result=success`, `NRestarts=0`, failed units `0`. Isolated port-3300 probe, USD balance/top-up compatibility, public status/assets, Nginx syntax, startup critical-log scan, database snapshot, and rollback-script syntax passed.
- Production endpoint verification used user `393`: database live invite count `91` versus legacy stored `7`; `/api/user/self` returned `aff_count=91`, and `/api/user/aff/invitees` returned `total=91`. `/api/user/aff/rebate` returned a successful paginated response. Rebate settings are exposed as enabled with ratio `8`.
- Sessions and API tokens were intentionally untouched: 392 active sessions and 2811 API tokens were identical before/after deployment. A first attempt was automatically rolled back after the daily backup timer collided with the shared lock (`TEMPFAIL 75`); the corrected script recognizes only that exact transient state and the successful retry cleared the stale failed-unit state.
- The daily DB backup timer is now explicit `OnCalendar=*-*-* 03:30:00 Asia/Shanghai`; next trigger verified as `2026-08-28 03:30:00 CST` (`2026-08-27 19:30:00 UTC`). Previous unit file backup: `/root/ops-backups/newapi-db-backup-daily-timer-20260827T033532Z/newapi-db-backup-daily.timer.before`.

### Rollback

```bash
ssh sever 'bash /backup/newapi/deployments/20260827T033311Z-before-aizzz-gateway-slim-20260825-11/rollback.sh'
```

- Rollback restores `.10`, SHA-256 `798aa1eede998d2689bc0423b1e003258495198311eabff215759eb3598ef330`.
- Core database backup: `/backup/newapi/deployments/20260827T033311Z-before-aizzz-gateway-slim-20260825-11/newapi.sql.zst`; `zstd -t`, `SHA256SUMS`, and rollback-script syntax passed.
- Local deployment script: `/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-11.sh`; server copy: `/root/deploy-aizzz-gateway-slim-20260825-11.sh`.


## Slim gateway `.12` deployment: administrator dashboard channel filters (2026-08-27)

- Source commit/tag: `e80d435f`, `release/aizzz-gateway-slim-20260825.12`; official base marker remains `official-v1.0.0-rc.25-f116414 (main-2d8e50bf)`.
- Release binary: `/opt/new-api/releases/aizzz-gateway-slim-20260825-12-e80d435f/new-api`, 131567778 bytes, SHA-256 `a2a01638fc159449f73ac3ce3fbaf7ee29e3af10a338cf3f075a178f2348693d`.
- Administrator dashboard supports a bounded, deduplicated `channel_ids` filter for aggregate model/cache data and flow data; invalid lists are rejected and self-service endpoints do not gain the administrator dimension.
- Deployed at `20260827T062919Z` UTC. Local/public status report `.12`; service is `active`, `Result=success`, `NRestarts=0`, failed units `0`. Isolated port-3300 probe, channel-filter requests, compatibility endpoints, public status/assets, Nginx syntax, database snapshot, startup critical-log scan, and rollback-script syntax passed.
- Full Go tests, frontend typecheck, and Vitest (53 files / 238 tests) passed. Login sessions/API tokens were intentionally untouched: 451 active sessions and 2811 API tokens were identical before/after deployment.

### Rollback

```bash
ssh sever 'bash /backup/newapi/deployments/20260827T062919Z-before-aizzz-gateway-slim-20260825-12/rollback.sh'
```

- Rollback restores `.14`, SHA-256 `2e39eb1eccc058cb6839413872b592834b10208f2051a72c6af78877662cc7b2`.
- Core database backup: `/backup/newapi/deployments/20260828T101303Z-before-aizzz-gateway-slim-20260825-15/newapi.sql.zst`; deployment script: `/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-15.sh`.


## Slim gateway `.14` deployment: per-channel upstream Responses WebSocket (2026-08-28)

- Source commit/tag: `5bfeb985`, `release/aizzz-gateway-slim-20260825.14`; official base remains `v1.0.0-rc.25`.
- Production binary: `/opt/new-api/releases/aizzz-gateway-slim-20260825-14-5bfeb985/new-api`, 131731618 bytes, SHA-256 `2e39eb1eccc058cb6839413872b592834b10208f2051a72c6af78877662cc7b2`.
- Downstream Responses WSS turns may use upstream WS/WSS through a per-channel administrator switch. Explicit unsupported responses use the channel's HTTP/SSE path for the current request and suspend only that channel's WS attempt for 24 hours; expiry permits one half-open probe. Ordinary HTTP requests stay unchanged.
- Deployment at `20260828T060400Z` UTC passed the isolated probe, local/public status and WSS handshakes, payment/balance and dashboard compatibility checks, public assets, Nginx, additive breaker-table migration, database snapshot integrity, and post-start log scan. Service is active/success with `NRestarts=0`, failed units 0.
- Sessions and API tokens were untouched: 702 active sessions and 2851 API tokens before/after.
- One-click rollback: `ssh sever 'bash /backup/newapi/deployments/20260828T060400Z-before-aizzz-gateway-slim-20260825-14/rollback.sh'`; restores `.13` SHA-256 `1b131c6fb8f63d7b218a02fd8e19177a9341e943f4e4b7a2d7448cffeb42964f`.
- Deployment scripts: `/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-14.sh` and `/root/deploy-aizzz-gateway-slim-20260825-14.sh`.

## Slim gateway `.15` deployment: per-channel concurrency and RPM routing (2026-08-28)

- Source commit/tag: `33405846`, `release/aizzz-gateway-slim-20260825.15`; official base remains `v1.0.0-rc.25`.
- Channel advanced settings now accept `max_concurrent_requests` and `requests_per_minute`; both default to `0` (unlimited), so existing channels retain their behavior.
- Capacity is reserved atomically immediately before each upstream attempt. A saturated channel is excluded from that selection and another channel is chosen only within the same concrete group and model, preferring the same priority before lower priorities. Specific-channel tokens and task-bound channels return `503` with `Retry-After` instead of changing channels.
- Concurrency leases cover normal HTTP, SSE, Responses WSS turns, Realtime sessions, retries, and task submissions, and release when the attempt actually finishes. RPM uses a rolling 60-second window. A Redis ZSET backend coordinates multiple nodes when Redis is enabled; the current single-node production configuration uses the process-local mutex backend.
- Verification passed the full Go suite, `go vet`, RelayKit independent tests/build, frontend typecheck, full Vitest (`55` files / `242` tests), production build, changed-file lint/format, and targeted race tests. Repository-wide service race still reports the pre-existing video polling/logger shared-state races documented in prior work.
- Production binary: `/opt/new-api/releases/aizzz-gateway-slim-20260825-15-33405846/new-api`, 131768482 bytes, SHA-256 `95a63d2eb87c506e75d8ea023d9c1f2e949e8002fc3f4e7ca64d58a3541c5a0a`.
- Deployment at `20260828T101303Z` UTC passed the isolated probe, three local/public Responses WSS handshakes, payment/balance and administrator dashboard compatibility checks, public asset hashes, Nginx, database snapshot integrity, rollback-script syntax, and post-start log scan. Service is active/success with `NRestarts=0`, failed units 0, and no listener remains on port 3300.
- Existing channels remain unlimited until an administrator sets either capacity field. The deployment issued no session or API-token mutation: active sessions remained 770 and API-token rows remained 2852.
- One-click rollback: `ssh sever 'bash /backup/newapi/deployments/20260828T101303Z-before-aizzz-gateway-slim-20260825-15/rollback.sh'`; restores `.14` SHA-256 `2e39eb1eccc058cb6839413872b592834b10208f2051a72c6af78877662cc7b2` while preserving later database writes.
- Deployment scripts: `/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-15.sh` and `/root/deploy-aizzz-gateway-slim-20260825-15.sh`; SHA-256 `93c130cf2e636cab2b3b4c1aa2e27866f31012f683df91c7fbbb9f8bd7a2d5fb`.

## Slim gateway `.16` deployment: preserve affinity during capacity spillover (2026-08-28)

- Source commit/tag: `d7392d15`, `release/aizzz-gateway-slim-20260825.16`; official base remains `v1.0.0-rc.25`.
- A channel-capacity rejection now marks the request only when it will spill over to another channel. If that fallback succeeds, affinity remains anchored to the originally selected channel instead of being rewritten to the temporary lower-priority channel.
- Ordinary upstream failure/retry behavior is unchanged: with `switch_on_success` enabled, a successful retry still updates affinity to the successful channel. Specific-channel bindings, same-group selection, billing, retries, and capacity accounting are unchanged.
- Regression coverage verifies capacity spillover marking, no false marker when the original channel has capacity, ordinary successful affinity switching, and preservation of the original affinity anchor after capacity fallback. Targeted race checks, `go test ./... -count=1`, and `go vet ./...` passed.
- Production uses the process-local affinity cache because Redis is disabled. The `.16` process restart discarded all pre-fix low-priority affinity entries; new bindings follow the corrected behavior.
- Production binary: `/opt/new-api/releases/aizzz-gateway-slim-20260825-16-d7392d15/new-api`, 131768482 bytes, SHA-256 `1ac3845b2752dd917a4bd424726e9a2abc55026016fa2fbe449170ca4a305b08`.
- Deployment at `20260828T122250Z` UTC passed the isolated probe, three local/public Responses WSS handshakes, payment/balance and administrator compatibility checks, public assets, Nginx, database snapshot integrity, rollback syntax, failed-unit check, and post-start log scan. Service is active/success with `NRestarts=0`, and no listener remains on port 3300.
- The deployment issued no session or API-token mutation: active sessions remained 804 and API-token rows remained 2854.
- One-click rollback: `ssh sever 'bash /backup/newapi/deployments/20260828T122250Z-before-aizzz-gateway-slim-20260825-16/rollback.sh'`; restores `.15` SHA-256 `95a63d2eb87c506e75d8ea023d9c1f2e949e8002fc3f4e7ca64d58a3541c5a0a` while preserving later database writes.
- Deployment scripts: `/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-16.sh` and `/root/deploy-aizzz-gateway-slim-20260825-16.sh`; SHA-256 `013b0e46e2d43e563b9884faaa98e2ea54439fa026045b95b74f8c572ed71f85`.

## Slim gateway `.18` deployment: configurable semantic prompt review (2026-08-29)

- Source commit/tag: `97b47c83`, `release/aizzz-gateway-slim-20260825.18`; official base remains `v1.0.0-rc.25`.
- Text requests now use the existing keyword scanner as a fast pass and, when enabled, call the configured gateway model for a semantic second decision. AIGC image/chat prompts and task prompts are covered; image/audio/video binaries are not sent to the review model.
- Production options: `PromptReviewEnabled=true`, model `gpt-5.6-luna`, reasoning effort `low`, timeout `1500ms`, block threshold `0.85`, and failure policy `block_on_keyword`. Administrators can change the model, effort, timeout, threshold, and failure policy from Security > Semantic prompt review.
- The pre-filter contains 108 high-risk intent phrases covering violence/weapons, self-harm, fraud/payment theft, credential theft/phishing, malware/attacks, privacy abuse, drugs/trafficking, and sexual exploitation. Historical, medical, legal, defensive-security, anti-fraud, sexual-health, translation, and journalistic contexts are delegated to semantic classification.
- The internal review token and header secret are server-environment-only. Internal review calls bypass recursive review, user/channel quota mutation, violation charging, and upstream header forwarding. Normal user requests and billing remain unchanged.
- Verification passed `go test ./...`, frontend typecheck, production build, isolated probe, compatibility endpoints, three Responses WSS handshakes, public assets, Nginx, database snapshot integrity, rollback syntax, and post-start log scan. Service is active/success with `NRestarts=0`; the production process loaded all seven options, both credentials, and 108 keywords.
- Production binary: `/opt/new-api/releases/aizzz-gateway-slim-20260825-18-97b47c83/new-api`, 131928329 bytes, SHA-256 `7d59f36b303d6e6c5b960baa4ea03fedfb5ab016b667e863b45425dd6c852b6b`.
- Deployment at `20260829T095651Z` UTC preserved login sessions and API tokens; live active sessions observed `931` after deployment and API-token rows remained `2860`.
- One-click rollback: `ssh sever 'bash /backup/newapi/deployments/20260829T095651Z-before-aizzz-gateway-slim-20260825-18/rollback.sh'`; restores `.17` binary SHA-256 `ae472d712be4585e15c1578e2ad8d3bea568bc9a7c30dc9a135f7f259f903e4f` while preserving later database writes.
- Deployment scripts: `/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-18.sh` and `/root/deploy-aizzz-gateway-slim-20260825-18.sh`; server script SHA-256 `e392268a5288dabbbd41ac9f6f75f85ff5b56debb8a175520966d29b5d7cc0a8`.

## Slim gateway `.19` deployment: review model compatibility fix (2026-08-29)

- Source commit/tag: `afeada13`, `release/aizzz-gateway-slim-20260825.19`.
- The internal review system prompt now contains the lowercase `json` marker required by the selected provider when `response_format.type=json_object` is used. The previous `.18` deployment was healthy but returned 400 for this provider-specific validation; no user data was lost.
- The internal token is assigned to `GPT luna专属分组`, which has an enabled `gpt-5.6-luna` channel. A live local smoke request returned HTTP 200 with one JSON classifier choice, confirming the end-to-end self-call.
- Production binary: `/opt/new-api/releases/aizzz-gateway-slim-20260825-19-afeada13/new-api`, 131928329 bytes, SHA-256 `96b926c471820b1374a7ff9f621b2b445638ec17a01e8d79c9b979bdacfeae62`.
- Deployment at `20260829T100738Z` UTC passed the standard isolated probe, compatibility endpoints, WSS handshakes, public assets, Nginx, database snapshot, rollback syntax and startup log gates. Service is active/success with `NRestarts=0`; login sessions were not revoked and API-token rows remained `2860`.
- One-click rollback: `ssh sever 'bash /backup/newapi/deployments/20260829T100738Z-before-aizzz-gateway-slim-20260825-19/rollback.sh'`; restores `.18` binary SHA-256 `7d59f36b303d6e6c5b960baa4ea03fedfb5ab016b667e863b45425dd6c852b6b` while preserving later database writes.
- Deployment script: `/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-19.sh` and `/root/deploy-aizzz-gateway-slim-20260825-19.sh`; server script SHA-256 `d36e2aa998be3818501d4ea014cc6e5c7c4be00e1cfed8bda7a126615544d9e3`.
