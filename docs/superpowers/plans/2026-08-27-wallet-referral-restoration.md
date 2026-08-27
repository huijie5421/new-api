# Wallet Referral Restoration Implementation Plan

1. Add failing model tests for live invite counting, soft-delete exclusion, and legacy counter refresh.
2. Add a failing frontend regression test for the full referral card and history action.
3. Implement model count/refresh helpers and use the live count in `GetSelf`.
4. Decouple future referral relationship counting from optional signup reward crediting.
5. Restore the authenticated rebate/invitee controllers and routes.
6. Restore the full referral card, rebate-history dialog, API bindings, types, locale strings, and right-column placement.
7. Run focused tests, complete Go tests, frontend tests, lint/type checks, and production build.
8. Build `.11`, create a release tag, deploy with backup and one-command rollback, then verify public assets, API compatibility, service health, and unchanged session/token totals.
9. Record source, binary, deployment, and rollback evidence in the handoff, progress, and operations documents.

