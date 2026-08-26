# Wallet Embedded Redeem Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved compact embedded redemption-code shop to the existing wallet without changing its theme or payment behavior.

**Architecture:** Introduce a self-contained `RedeemCodeShopCard` that validates the existing `topup_link`, falls back to the fixed CatFK shop when that setting is empty, renders a constrained iframe, and always offers a secure new-tab path. Mount it after the existing recharge/subscription area, leaving `RechargeFormCard`, payment hooks, and redemption APIs untouched.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, react-i18next, Vitest, Testing Library.

---

### Task 1: Define and test the external shop URL contract

**Files:**
- Create: `web/src/features/wallet/lib/redeem-shop.ts`
- Create: `web/src/features/wallet/lib/__tests__/redeem-shop.test.ts`

- [ ] **Step 1: Write failing URL normalization tests**

Test a wished-for `normalizeRedeemShopUrl` API: it returns a trimmed HTTPS URL for `https://catfk.com/shop/WWADEZ6N`, and returns `null` for empty, malformed, HTTP, credential-bearing, or non-web values.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd web && bun run test src/features/wallet/lib/__tests__/redeem-shop.test.ts
```

Expected: FAIL because `normalizeRedeemShopUrl` does not exist.

- [ ] **Step 3: Implement the minimal normalizer**

Export `DEFAULT_REDEEM_SHOP_URL = 'https://catfk.com/shop/WWADEZ6N'`. Parse with `new URL`, require the CatFK HTTPS `/shop/` path, reject username/password, and return `parsed.toString()`; catch parse errors and return `null`.

- [ ] **Step 4: Verify GREEN**

Run the focused test again and expect PASS.

### Task 2: Build the tested embedded shop card

**Files:**
- Create: `web/src/features/wallet/components/redeem-code-shop-card.tsx`
- Create: `web/src/features/wallet/components/__tests__/redeem-code-shop-card.test.tsx`
- Modify: `web/src/features/wallet/lib/redeem-shop.ts`

- [ ] **Step 1: Write failing component tests**

Render the card with an HTTPS shop URL and assert:

- iframe `title` and `src` are present;
- both desktop “点击最大化” and mobile “新标签页打开” anchors target the same URL;
- anchors use `_blank` and include `noopener noreferrer`;
- invalid URLs render nothing;
- firing iframe `load` removes the loading message;
- advancing fake timers past the timeout replaces loading with the fallback message while preserving the new-tab link.

- [ ] **Step 2: Run the focused component test and verify RED**

```bash
cd web && bun run test src/features/wallet/components/__tests__/redeem-code-shop-card.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the card**

Use the existing `TitledCard`, `Button`, theme tokens, and responsive utilities. Render a compact iframe container (`h-[30rem]`, smaller mobile height permitted), a loading layer, a timeout fallback, a desktop hover/focus overlay, and a mobile-visible external link. Use `allow="payment"`, `referrerPolicy="strict-origin-when-cross-origin"`, and no account data in the URL.

- [ ] **Step 4: Verify GREEN**

Run both wallet shop tests and expect PASS.

### Task 3: Mount the card without changing wallet behavior

**Files:**
- Modify: `web/src/features/wallet/index.tsx`
- Test: `web/src/features/wallet/components/__tests__/redeem-code-shop-card.test.tsx`

- [ ] **Step 1: Import and mount the component**

Pass `topupInfo?.topup_link` to `<RedeemCodeShopCard />` after the current recharge/subscription grid and before `AffiliateRewardsCard`. Do not change `RechargeFormCard` props or payment handlers.

- [ ] **Step 2: Run focused wallet tests**

```bash
cd web && bun run test src/features/wallet/lib/__tests__/redeem-shop.test.ts src/features/wallet/components/__tests__/redeem-code-shop-card.test.tsx src/features/wallet/hooks/use-payment.test.ts src/features/wallet/lib/payment-target.test.ts
```

Expected: PASS.

### Task 4: Synchronize translations and commit

**Files:**
- Modify: `web/src/i18n/locales/en.json`
- Modify: `web/src/i18n/locales/zh.json`
- Modify: other generated locale JSON files through the repository i18n script
- Add: `docs/superpowers/plans/2026-08-26-wallet-embedded-redeem-shop.md`

- [ ] **Step 1: Add source translation keys and synchronize locales**

Use English source keys for “Buy redemption codes”, “Browse products here, then redeem your code below”, “Click to maximize”, “Open in new tab”, “Loading shop”, and “The shop did not load here. Continue in a new tab.” Add Simplified Chinese translations, then run:

```bash
cd web && bun run i18n:sync
```

- [ ] **Step 2: Run frontend quality gates**

```bash
cd web
bun run test src/features/wallet/lib/__tests__/redeem-shop.test.ts src/features/wallet/components/__tests__/redeem-code-shop-card.test.tsx
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Expected: all commands PASS.

- [ ] **Step 3: Review and commit**

```bash
git diff --check
git add web/src/features/wallet web/src/i18n/locales docs/superpowers/plans/2026-08-26-wallet-embedded-redeem-shop.md docs/superpowers/specs/2026-08-26-wallet-redeem-shop-design.md
git commit -m "feat(wallet): embed redemption shop"
```

### Task 5: Verify the combined update

**Files:**
- Verify all files from both implementation plans.

- [ ] **Step 1: Run combined targeted tests**

```bash
go test ./controller -run 'TestNormalizeAigcWorkshopImageRequest|TestNewAigcWorkshopToken' -count=1
cd web && bun run test src/features/wallet/lib/__tests__/redeem-shop.test.ts src/features/wallet/components/__tests__/redeem-code-shop-card.test.tsx
```

- [ ] **Step 2: Run combined build checks**

```bash
cd web && bun run typecheck && bun run lint && bun run build
```

- [ ] **Step 3: Confirm scope and history**

```bash
git status --short
git log --oneline -5
git diff --check HEAD~2..HEAD
```

Expected: only `.superpowers/` remains untracked; the AIGC and wallet commits are both present and no deployment has occurred.
