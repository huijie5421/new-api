# AI Maintainer Handoff

This file is the entry point for another AI or engineer continuing the slim
gateway. Read it before changing code or production state. Detailed history is
linked rather than duplicated where possible.

## Current baseline

| Item | Current value |
| --- | --- |
| Source repository | `/home/huiji/code/Api/new-api-slim-aigc-v1-20260825` |
| Branch | `codex/slim-aigc-v1` |
| Latest functional source commit | `f5a0c48a` (Apple-style UI refresh — deployed as `.09`, then rolled back by operator decision) |
| Production runtime source commit | `080b678e` (Home removal and console default) |
| Production release | `aizzz-gateway-slim-20260825.08` (restored `20260826T082740Z` after `.09` rollback) |
| Official base | `v1.0.0-rc.25`, commit `f116414284162ad15d8925f7bca494c109b83e93` |
| Runtime base marker | `official-v1.0.0-rc.25-f116414 (main-2d8e50bf)` |
| Production binary SHA-256 | `a56407328aee76bfe3fd0d9cb958224987f3ca0e802f0fb1a79b04167e38602d` |
| Deployment timestamp | `.08` restored `20260826T082740Z` UTC (original `.08` deploy `20260826T065012Z`) |
| Next release label | `.10` unless the operator specifies another label (`.09` is burned) |

Production runs `080b678e` even though the branch tip contains the newer
`f5a0c48a` UI refresh: the operator was dissatisfied with the `.09` visuals and
ordered a rollback. Do NOT redeploy `f5a0c48a` as-is; a redesigned UI must be
approved by the operator first. Always verify the actual branch tip with
`git rev-parse --short HEAD`. Source-level reference tags:
`rollback/aizzz-gateway-slim-20260825.08` (`080b678e`) and
`release/aizzz-gateway-slim-20260825.09` (`f5a0c48a`, rolled back).

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
- Verification completed: targeted Go tests, `go test ./... -count=1`, `go build -buildvcs=false`, frontend typecheck, production build, full Vitest suite (53 files / 244 tests), changed-file formatting/lint, and `git diff --check`. The repository-wide format check still lists unrelated pre-existing files; no new test failure occurred in the focused suite.
- This change is source-only. No production binary, database, service restart, login-session refresh, or token mutation was performed. Production remains `.08` until a separate deployment decision.

## Production and rollback

Production access uses the existing SSH alias `sever`. Do not place passwords,
API keys, cookies, merchant secrets, or private keys in commits or handoff
documents.

Current release path (production runs the restored `.08` binary at
`/opt/new-api/current/new-api`; the rolled-back `.09` release remains at):

```text
/opt/new-api/releases/aizzz-gateway-slim-20260825-08-080b678e/new-api
/opt/new-api/releases/aizzz-gateway-slim-20260825-09-f5a0c48a/new-api  (rolled back, do not reuse without operator approval)
```

One-click rollback to `.07` (from the running `.08`):

```bash
ssh sever '/backup/newapi/deployments/20260826T065012Z-before-aizzz-gateway-slim-20260825-08/rollback.sh'
```

Core database snapshots:

```text
/backup/newapi/deployments/20260826T065012Z-before-aizzz-gateway-slim-20260825-08/newapi.sql.zst
/backup/newapi/deployments/20260826T081803Z-before-aizzz-gateway-slim-20260825-09/newapi.sql.zst
```

Deployment scripts:

```text
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-08.sh
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-09.sh  (deployed then rolled back)
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

As of this handoff, frontend typecheck, 53 test files / 244 tests, production
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
