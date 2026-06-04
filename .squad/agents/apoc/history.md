# Apoc — History

## Seed

- **Project:** tscope — a tool for developers to track and analyze their token usage, motivated by GitHub's new usage-based billing for Copilot (organizations & enterprises).
- **User:** robpitcher
- **Role:** Tester / Quality
- **Created:** 2026-06-03

## Learnings

### 2026-06-03 — CI Workflow Established

CI workflow now runs on every PR: lint + build + test across Node 18/20/22. All contributions validated automatically before merge.

### 2026-06-03 — Repository URL Migration (Trinity Lead)

Trinity completed migration of canonical repository URL from `devjoy-pub/tscope` to `robpitcher/tscope`. All in-repo references updated including critical HTML report links. Build clean, 236 tests passing. See `.squad/decisions/decisions.md` for details.

### 2026-06-03 — GitHub Repository Housekeeping & Publishing Strategy (Trinity Lead)

Trinity created full GitHub collaboration infrastructure: CONTRIBUTING.md (contributor guide), .github/pull_request_template.md (PR checklist), .github/ISSUE_TEMPLATE/{bug_report,feature_request}.md (issue templates), and decision note on GitHub Packages publishing. **Decision: stick with npmjs.org as sole registry.** Rationale: GitHub Packages requires scoped package names + consumer .npmrc auth, adding friction to `npm i -g tscope` with zero user benefit. npmjs.org is zero-friction default. Package `tscope` already claimed on npmjs.org (v0.3.0, same project). D2 distribution model requires npmjs.org. All files staged for user review/commit.

### 2026-06-04 — Distribution Model Analysis Complete (Trinity Lead)

Trinity validated D2 (npm as primary distribution channel) against comprehensive analysis of Copilot CLI plugin model and gh CLI extensions. **Outcome: D2 confirmed, no amendment.** Copilot plugins are wrong architectural fit for standalone binary. gh-tscope extension viable as secondary channel post-v1.0 if reach expansion justifies cross-platform binary pipeline. Decision merged to decisions.md. Future horizon noted: add gh-tscope extension + precompiled binaries (win/mac/linux, amd64/arm64) post-v1.0, conditional on market demand.
