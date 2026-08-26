# Remove Home Tab and Default to Console Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with verification checkpoints.

**Goal:** Remove the Home top-navigation entry and make `/` lead authenticated users to the console while sending unauthenticated users into the existing sign-in flow.

**Architecture:** Keep the existing TanStack Router authentication boundary and official session store. Replace the public Home route component with a route-level redirect that preserves `/dashboard` as the post-login target, and make the shared navigation defaults/backend option default Home disabled so dynamic and fallback navigation agree.

**Tech Stack:** React 19, TanStack Router, Zustand auth store, Vitest, TypeScript native preview, Rsbuild, Go/Gin status options.

---

### Task 1: Lock current contracts with failing tests

**Files:**
- Create: `web/src/lib/nav-modules.test.ts`
- Modify: `web/src/lib/legacy-route.test.ts`

- [ ] Add tests asserting empty header-navigation config parses with `home: false`, explicit `home: true` remains supported for backward-compatible configuration parsing, and root legacy mapping resolves `/` to `/dashboard`.
- [ ] Run the focused Vitest tests and confirm the new default expectation fails against the current `home: true` implementation.

### Task 2: Remove Home from navigation defaults

**Files:**
- Modify: `web/src/lib/nav-modules.ts`
- Modify: `web/src/features/system-settings/maintenance/config.ts`
- Modify: `web/src/hooks/use-top-nav-links.ts`
- Modify: `controller/misc.go` or the persisted option only if the server default is code-defined

- [ ] Set frontend header-navigation defaults to `home: false`.
- [ ] Keep parsing of explicit `home: true` for existing administrator settings, but do not emit Home from the shared top-navigation builder.
- [ ] Keep Console and all retained custom tabs unchanged.
- [ ] Update the settings model so reset/default state reflects Home being removed.

### Task 3: Redirect root to console/login

**Files:**
- Modify: `web/src/routes/index.tsx`
- Modify: `web/src/lib/legacy-route.ts` and its tests if the route resolver owns root fallback behavior

- [ ] Replace the Home component with a route-level redirect to `/dashboard` for the authenticated path.
- [ ] Ensure unauthenticated `/` reaches the existing `_authenticated` guard and redirects to `/sign-in` with a sanitized `/dashboard` target.
- [ ] Make `/home` a compatibility redirect to `/dashboard` without rendering the removed Home page.

### Task 4: Verify and package

**Files:**
- Modify: `progress.md` and `SERVER-OPS.md` after deployment approval/verification.

- [ ] Run `bun run typecheck`, focused Vitest tests, `bun run test`, `bun run build`, `bun run format:check`, and `git diff --check`.
- [ ] Build a `.08` candidate labeled from the current source commit and verify its `/api/status` marker locally before deployment.
- [ ] Preserve a one-click rollback to `.07`; do not refresh sessions unless separately requested.
