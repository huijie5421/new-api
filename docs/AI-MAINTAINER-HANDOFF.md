# AI Maintainer Handoff

This file is the entry point for another AI or engineer continuing the slim
gateway. Read it before changing code or production state. Detailed history is
linked rather than duplicated where possible.

## Current baseline

| Item | Current value |
| --- | --- |
| Source repository | `/home/huiji/code/Api/new-api-slim-aigc-v1-20260825` |
| Branch | `codex/slim-aigc-v1` |
| Latest functional source commit | `080b678e` (Home removal and console default) |
| Production runtime source commit | `080b678e` |
| Production release | `aizzz-gateway-slim-20260825.08` |
| Official base | `v1.0.0-rc.25`, commit `f116414284162ad15d8925f7bca494c109b83e93` |
| Runtime base marker | `official-v1.0.0-rc.25-f116414 (main-2d8e50bf)` |
| Production binary SHA-256 | `a56407328aee76bfe3fd0d9cb958224987f3ca0e802f0fb1a79b04167e38602d` |
| Deployment timestamp | `20260826T065012Z` UTC |
| Next release label | `.09` unless the operator specifies another label |

The executable code deployed in `.08` is `080b678e`; later commits may only add
handoff or operational documentation. Always verify the actual branch tip with
`git rev-parse --short HEAD`. The working tree was clean when this handoff was
written.

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

## Production and rollback

Production access uses the existing SSH alias `sever`. Do not place passwords,
API keys, cookies, merchant secrets, or private keys in commits or handoff
documents.

Current release path:

```text
/opt/new-api/releases/aizzz-gateway-slim-20260825-08-080b678e/new-api
```

One-click rollback to `.07`:

```bash
ssh sever '/backup/newapi/deployments/20260826T065012Z-before-aizzz-gateway-slim-20260825-08/rollback.sh'
```

Core database snapshot:

```text
/backup/newapi/deployments/20260826T065012Z-before-aizzz-gateway-slim-20260825-08/newapi.sql.zst
```

Deployment script:

```text
/home/huiji/code/Api/docs/deploy-aizzz-gateway-slim-20260825-08.sh
```

The `.08` deployment did not refresh or revoke sessions. Its deployment-time
snapshot recorded 76 active login sessions and 2789 API tokens unchanged; these
counts are historical evidence, not future expected constants.

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

As of this handoff, frontend typecheck, 48 test files / 219 tests, production
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
