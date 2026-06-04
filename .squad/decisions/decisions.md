# Team Decisions

## Decision: CI Workflow for tscope

**Author:** Tank  
**Date:** 2026-06-03  
**Status:** Adopted  

### 1. Node 18/20/22 Test Matrix
Adopted a matrix strategy running the test suite against Node.js versions 18.x, 20.x, and 22.x on every CI run. This catches version-specific regressions early given tscope targets `engines.node >= 18.0.0`.

### 2. CI Gates: lint + build + test on Every PR
Every pull_request trigger runs the full validation pipeline in order:
1. `npm run lint` — ESLint on TypeScript source
2. `npm run build` — TypeScript compile (tsc, strict mode)
3. `npm test` — Jest suite (197 tests as of 2026-06-03)

No shortcuts — all three gates must pass for the workflow to succeed. This is the minimum bar for merging any PR.

### 3. Manual Trigger via workflow_dispatch
The CI workflow also supports `workflow_dispatch` so maintainers can re-run validation on any branch from the Actions tab without needing to push a commit or open a PR.

### 4. Concurrency: Cancel Stale Runs on the Same Branch
Concurrency group keyed on `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`. This prevents piled-up runs when force-pushing or rapid-pushing to a PR branch.

### 5. Action Pinning Convention
All actions pinned to major-version tags (`@v4`), consistent with the squad-* workflows already in `.github/workflows/`. No floating `@main` refs, no full SHAs.
