---
"tscope": minor
---

**OTel-primary pivot with merge support: unified reports, per-session provenance, cost data, reasoning + context-window metrics.**

- New `--source auto|otel|logs` flag (default: `auto`). `auto` **merges** OTel and log-parser sessions into one unified report — OTel is authoritative on overlap (no double-counting), logs provide historical context. `otel` forces OTel-only. `logs` forces log-parser only.
- Deduplicated, merged reports in all output formats: text, JSON, and HTML. Per-session source badges show which sessions are OTel vs. log-parser, so you always know cost availability.
- Per-session and per-model **AI credit cost** from the OTel `github.copilot.nano_aiu` attribute — server-side billing, no rate-table guesswork. OTel sessions show credits; log-parser sessions show "cost unavailable".
- **Reasoning tokens** and **context-window utilization** (`extended` block) surfaced in OTel sessions (text, JSON, HTML).
- HTML dashboard: **coverage summary** for mixed reports ("N OTel · M logs"), **per-session source badge** on every card, **cost unavailable badge** on logs cards, *Total Credits* stat card (OTel only), *Credits by Model* chart, and context-window utilization bar (amber ≥ 80%).
- JSON schema `tscope/report/v5` — evolved in place (no v6 bump). New top-level fields: `source` (`"otel"` | `"logs"` | `"mixed"`), `coverage` object (`otelCount`, `logsCount`, `costCoverage`). New per-session `source` field. OTel-only fields: `totalCost`, `modelCosts`, `extended`. All v4 fields preserved — additive.
- Empty-range OTel hint: when the OTel source finds no sessions for the requested date range, a helpful advisory is printed to stderr pointing to `--source logs` or `--all`.

