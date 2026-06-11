# Trinity — History

## Seed

- **Project:** tscope — a tool for developers to track and analyze their token usage, motivated by GitHub's new usage-based billing for Copilot (organizations & enterprises).
- **User:** robpitcher
- **Role:** Lead / Architect
- **Created:** 2026-06-03

## Learnings

### 2026-06-11: Issue #6 Superseded by OTel Work

- Issue #6 (log-parser AI credits from `totalNanoAiu`) is functionally superseded by PR #8's OTel implementation. Same metric, different pipe.
- The team ratified "logs-only sessions show cost unavailable" THREE times in decisions.md (lines 294, 320, 523). This is deliberate policy, not a gap.
- Key insight: when OTel and logs read the same nano-AIU value, the architecture question isn't "can we?" but "should we?" — and the answer was "no, OTel is the authoritative cost source."
- Historical cost gap is self-resolving: once OTel is enabled, new sessions get cost automatically. The "unavailable" state shrinks over time without code changes.
- Scope discipline: PR #8 should ship as-is. Adding log-parser credits would re-open a completed, tested PR for marginal value that contradicts ratified policy.
- Drafted #6 close comment for reuse by scribe/ops team, merged to decisions.md entry for institutional memory.
- Next step: file issue #6 closure comment using this rationale; monitor #8 for merge readiness (scope boundaries now clear).
