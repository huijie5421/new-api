# AIGC GPT Image 2 Reference Fidelity Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure AIGC Workshop reference-image requests for `gpt-image-2` preserve the selected reference by omitting the unsupported `input_fidelity` parameter while keeping the existing edit route and image payload intact.

**Architecture:** Keep the existing reference resolution, JSON async task, and `/v1/images/edits` relay flow because production evidence shows that the upstream receives and bills the image input. Remove the obsolete fidelity selector from the GPT Image 2-only workshop and strip `input_fidelity` in the workshop backend normalizer so stale clients cannot reintroduce the incompatible field.

**Tech Stack:** React 19, TypeScript, Vitest, Go 1.25, standard `testing` package.

---

### Task 1: Lock the backend request contract with a regression test

**Files:**
- Create: `controller/aigc_workshop_image_params_test.go`
- Modify: `controller/aigc_workshop_image_params.go`

- [ ] **Step 1: Write the failing test**

Add `TestNormalizeAigcWorkshopImageRequestOmitsGptImage2InputFidelity`. It must normalize a body containing `model: "gpt-image-2"`, a data-URL `image`, and `input_fidelity: "low"`, then assert that the image remains present and `input_fidelity` is absent.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
go test ./controller -run TestNormalizeAigcWorkshopImageRequestOmitsGptImage2InputFidelity -count=1
```

Expected: FAIL because the current normalizer retains `input_fidelity`.

- [ ] **Step 3: Implement the minimal backend guard**

Add `Model string` to `aigcWorkshopImageParameters`. After decoding the raw payload map, delete `input_fidelity` when the normalized model is `image-2`, `gpt-image-2`, or starts with `gpt-image-2-`. Do not modify public relay endpoints or the `image`/`images` normalization.

- [ ] **Step 4: Add boundary coverage and verify GREEN**

Add a second test proving a non-GPT-Image-2 model retains a valid `input_fidelity`. Run:

```bash
go test ./controller -run 'TestNormalizeAigcWorkshopImageRequest.*InputFidelity' -count=1
```

Expected: PASS.

### Task 2: Remove the incompatible control from the GPT Image 2-only frontend

**Files:**
- Modify: `web/src/features/aigc-workshop/index.tsx`
- Modify: `web/src/features/aigc-workshop/types.ts`
- Test: `controller/aigc_workshop_image_params_test.go`

- [ ] **Step 1: Confirm the frontend contract is covered by the backend regression**

The workshop model list is already filtered by `isGptImage2Model`, so the frontend must have no state, prop, UI selector, or payload assignment for `imageInputFidelity`. Use:

```bash
grep -n 'imageInputFidelity\|ImageInputFidelity\|input_fidelity' web/src/features/aigc-workshop/index.tsx web/src/features/aigc-workshop/types.ts
```

Expected before implementation: matches in state, payload, props, selector, and type.

- [ ] **Step 2: Implement the minimal frontend change**

Remove `ImageInputFidelity`, the default `low` state, `payload.input_fidelity`, the OriginImageStudio props/callback, and the “参考保真度” ChipSelect. Keep `image`, `images`, and `mask` handling unchanged.

- [ ] **Step 3: Verify the unsupported field is absent**

Run the grep command again.

Expected: no matches in the two workshop files.

- [ ] **Step 4: Run focused and package verification**

Run:

```bash
go test ./controller -run 'TestNormalizeAigcWorkshopImageRequest|TestNewAigcWorkshopToken' -count=1
cd web && bun run typecheck && bun run lint
```

Expected: all commands PASS.

### Task 3: Commit the isolated AIGC fix

**Files:**
- Modify: `controller/aigc_workshop_image_params.go`
- Create: `controller/aigc_workshop_image_params_test.go`
- Modify: `web/src/features/aigc-workshop/index.tsx`
- Modify: `web/src/features/aigc-workshop/types.ts`
- Add: `docs/superpowers/plans/2026-08-26-aigc-gpt-image-2-reference-fidelity.md`

- [ ] **Step 1: Review the diff**

```bash
git diff --check
git diff -- controller/aigc_workshop_image_params.go controller/aigc_workshop_image_params_test.go web/src/features/aigc-workshop/index.tsx web/src/features/aigc-workshop/types.ts
```

- [ ] **Step 2: Commit**

```bash
git add controller/aigc_workshop_image_params.go controller/aigc_workshop_image_params_test.go web/src/features/aigc-workshop/index.tsx web/src/features/aigc-workshop/types.ts docs/superpowers/plans/2026-08-26-aigc-gpt-image-2-reference-fidelity.md
git commit -m "fix(aigc): preserve gpt image 2 references"
```
