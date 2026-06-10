---
"tscope": minor
---

**OTel-primary pivot: `--source` flag, per-session cost, reasoning + context-window metrics, HTML provenance, JSON schema v5.**

- New `--source auto|otel|logs` flag (default: `auto`). `auto` uses `~/.copilot/tscope/otel.jsonl` when available and falls back to the `events.jsonl` log parser with a notice. `otel` forces OTel and exits with a helpful message if unavailable. `logs` forces the log parser (pre-pivot behavior).
- Per-session and per-model **AI credit cost** from the OTel `github.copilot.nano_aiu` attribute — server-side billing, no rate-table guesswork. Shown in text footer, HTML credit chips, and JSON `totalCost`/`modelCosts` fields.
- **Reasoning tokens** and **context-window utilization** (`extended` block) surfaced in text, HTML, and JSON for OTel sessions.
- HTML dashboard gains: source provenance badge, per-session credit chips, *Credits by Model* chart, *Total Credits* stat card, and a context-window utilization bar (amber ≥ 80%).
- JSON schema bumped `tscope/report/v4` → `tscope/report/v5`. New top-level fields: `source`, `costAvailable`. New per-session fields: `source`, `totalCost` (OTel only), `modelCosts` (OTel only), `extended` (OTel only). All v4 fields preserved — the change is additive.
- Empty-range OTel hint: when the OTel source finds no sessions for the requested date range, a helpful advisory is printed to stderr pointing to `--source logs` or `--all`.
