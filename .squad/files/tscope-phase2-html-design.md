# tscope Phase 2 — HTML Dashboard Design Proposal

**Author:** Switch (Frontend / Dashboard)  
**Date:** 2026-06-02  
**Status:** Draft — for discussion with robpitcher  
**Issues:** #13 (JSON), #14 (HTML), #15 (/chronicle tips)

---

## 1. HTML Report — Delivery Model

### Options

| Option | Pros | Cons |
|---|---|---|
| **A. Single self-contained `.html`** (inline CSS/JS/SVG, zero external refs) | Fully portable, email-safe, works offline, no server, no CDN dependency | Slightly larger file; embedding a chart lib inflates to ~60–200 KB |
| **B. CDN-linked** (e.g., Chart.js via jsDelivr) | Smaller file on disk | Breaks offline, breaks in air-gapped/corporate environments, defeats shareability |
| **C. Local served dashboard** (e.g., `tscope serve`) | Live/interactive, auto-refresh | Requires a running process, not portable, far more infra |

### Recommendation: **Option A — single self-contained `.html`**

The value proposition for a developer emailing themselves a weekly cost snapshot is ruined if it renders as a blank page on the plane or in a network-restricted corp environment. Issue #14's AC says "CDN-linked is acceptable" but I'd override that in favour of self-contained — the portability upside is large and the cost is at most 150–200 KB total file size. Option C is out of scope for phase 2.

---

## 2. Charting Approach

### Options

| Option | Size (embedded) | Offline | Shareable | Effort |
|---|---|---|---|---|
| **Pure CSS bars** (width %-of-max, flex layout) | ~0 KB extra | ✅ | ✅ | Low |
| **Hand-rolled inline SVG** | ~0 KB extra | ✅ | ✅ | Medium |
| **Chart.js inlined** | ~200 KB min | ✅ | ✅ | Low |
| **uPlot inlined** | ~40 KB | ✅ | ✅ | Medium |

### Recommendation: **Hand-rolled inline SVG + CSS bars for simple cases**

For THIS data (a handful of models, 4 token categories, a few sessions per day), a full chart library is overkill. Inline SVG is already the browser's native chart primitive — no deps, renders everywhere, is copy-pasteable into Slack/email.

**Approach:** Generate SVG markup inside the TypeScript template literal directly. The `HtmlRenderer` computes bar widths as percentages of the session-maximum value and emits the `<svg>` tags. For the "credits over time" visual — which currently requires cross-session data (see §3) — a pure CSS table/bar grid is sufficient.

If we later need more complex interactivity (hover tooltips, drill-down), uPlot (~40 KB minified, no deps) is the right step up. Embed it inline at that point.

---

## 3. What Visuals Actually Matter — and the Aggregation Question

### ⚠️ Open Design Question: Per-session only, or multi-session in HTML?

The phase-1 `Report` type is already scoped to a single day (today by default). Issue #14 says "credits over time" in the acceptance criteria, which **requires cross-session data**. The text renderer is strictly per-session, but the HTML renderer is phase-2 and there's no explicit rule that HTML must also be per-session-only.

**My recommendation:** Allow HTML to receive a `Report` that may contain multiple sessions (already the case — `Report.sessions` is an array). When `--all` or `--range` flags are added (#12), pass the full multi-session report to the renderer. The HTML renderer's job is just to visualize whatever `Report` is handed to it — no special aggregation logic lives in the renderer itself. This respects the architecture seam.

### Proposed Visuals (ranked by value)

1. **⭐⭐⭐ Per-model token stacked bar** (horizontal, per session): input / cache-read / cache-write / output — the core data, highest information density. One bar per model, coloured by token type.

2. **⭐⭐⭐ Credits-by-model bar or donut** (per session): which model cost the most? Directly answers the developer's question "was it the Opus call or the Haiku call that blew my budget?"

3. **⭐⭐ Cache efficiency metric**: `(cacheReadTokens / inputTokens) × 100%` — a single number per model and per session. High cache hit = money saved. Show as a coloured pill (green >60%, yellow 30–60%, red <30%).

4. **⭐⭐ Credits-over-time sparkline** (multi-session bar chart): one bar per session chronologically, height = total credits. Only meaningful when `--all` or `--range` is active; collapse gracefully to "only one session" when showing today.

5. **⭐ Session summary header card**: session ID (truncated for display here — the full UUID is the text renderer's job), repo/branch from `workspace.yaml` if available, date/time, duration (if end time can be derived from shutdown timestamp), total premium requests.

**Deliberately excluded:** Real-time/live data, interactive drill-down, cross-user aggregation — all out of scope for phase 2.

---

## 4. CLI Surface

### Flag design

```
tscope --html [FILE]          # generate HTML report
tscope --html                 # default output path: ./tscope-report-YYYY-MM-DD.html
tscope --html report.html     # explicit path
tscope --html --open          # generate + auto-open in default browser
```

**Details:**
- `--html` with no FILE argument defaults to `./tscope-report-<YYYY-MM-DD>.html` in the current working directory — not a temp directory, not `~`, so it's obvious where it landed.
- **Overwrite behaviour:** If the file exists, overwrite silently. The filename includes the date, so same-day re-runs replace the previous report. If this feels wrong we could add `--force`, but that adds noise for zero daily-user benefit.
- **Auto-open:** `--open` (or `--html --open`) invokes the platform `start` (Windows), `open` (macOS), or `xdg-open` (Linux) to pop the browser. Optional flag, default off. Node's `child_process.exec` handles this.
- **Format flag vs dedicated flag:** I prefer `--html [FILE]` over `--format html --output FILE` because it's more ergonomic for the "I want an HTML report" use case. The `--format` path exists for `--json` (#13) since JSON output pipes naturally to stdout; HTML really needs a file path.

### Recommendation
`tscope --html [FILE]` with optional `--open`. Keep `--format json` for #13 (stdout pipe-friendly).

---

## 5. /chronicle Tips Integration (#15)

### What we know
- The AC says: `tscope --html report.html --chronicle-tips` invokes `copilot /chronicle tips` as a subprocess and embeds output in an "Insights" section.
- This is Tank's implementation work, but the HTML layout implications are mine.

### Open questions that need verification

1. **Is `copilot /chronicle tips` non-interactive/scriptable?** Unknown. If it requires a TTY or interactive confirmation, capturing stdout via `child_process.execSync` will hang or fail. **Needs to be tested** by Tank before implementation.
2. **What format does the output arrive in?** Plain text? Markdown? ANSI-colored? If ANSI-colored, we need to strip codes before embedding in HTML. If Markdown, we can render it with a tiny inline renderer (or just `<pre>`).
3. **What's the timeout?** If `copilot` is slow or unavailable, the report generation must not hang. Recommend a hard 10-second timeout on the subprocess call.

### Proposed approach
- **Happy path:** `copilot /chronicle tips` exits 0 → capture stdout → embed as a styled `<section id="insights">` with preformatted or lightly-parsed content.
- **Graceful degradation (3 levels):**
  1. Command not found → omit section entirely, no error (just a console warning to stderr: `⚠ copilot not found — skipping /chronicle tips`)
  2. Command exits non-zero → omit section, stderr warning with exit code
  3. Command times out (>10s) → omit section, stderr warning
- **HTML placement:** "Insights" section appears at the top of the report, above the per-session data — it's advisory context, not data.
- **Flag gating:** `--chronicle-tips` is opt-in. The HTML report works without it. This avoids a surprise subprocess call every time `--html` is used.

### What needs verification before implementation
- [ ] Does `copilot /chronicle tips` run non-interactively (pipe stdout to `/dev/null`, run with no TTY)?
- [ ] Output format — plain text or structured?
- [ ] Is this command available on all platforms tscope targets?

---

## 6. Build / Tooling Impact

### Constraints
- Must preserve the "single shareable file" goal.
- Must not require a separate build step to produce the HTML (no webpack/rollup/vite for the renderer itself).
- `HtmlRenderer` lives in `src/render/HtmlRenderer.ts` and is compiled by the existing `tsc` build — nothing else needed.

### Lightest path

**Template literals in TypeScript.** The `HtmlRenderer.render(report)` method builds the entire HTML document as a tagged template string, inlines the hand-rolled SVG, CSS, and any tiny JS (maybe 50–100 lines for interactivity like expand/collapse), and writes it to disk with `fs.writeFileSync`. Zero new dependencies. The existing `tsc` build compiles it with everything else.

**What changes:**
- `src/render/HtmlRenderer.ts` — new file
- `src/render/index.ts` — register `'html'` → `new HtmlRenderer(outputPath)`
- `src/index.ts` — parse `--html [FILE]` and `--open` flags, pass path to renderer; renderer writes to file instead of stdout (the `render()` signature returns `void`, which allows either)

**One design note on the Renderer interface:** The current signature is `render(report: Report): void`. For HTML, the renderer needs to know the output file path. Two options:
- Pass it in the constructor: `new HtmlRenderer('./report.html')` ← **recommended**, clean
- Extend the interface with an optional path param ← avoid, breaks the interface contract

No new npm dependencies needed for phase 2 HTML. If we later embed uPlot, it's a copy of the minified source as a JS string — still no new npm deps for distribution.

---

## 7. Recommended Sequencing

```
#13 JSON Renderer  →  #14 HTML Report  →  #15 /chronicle tips
     (Tank)               (Switch)              (Tank)
```

### Rationale

1. **#13 JSON first (Tank):** JSON renderer is the simplest possible renderer — serialize the `Report` object to stdout. Building it confirms the renderer pattern works end-to-end, flushes out any issues with the `Report` type before HTML adds complexity, and gives us a machine-readable output that the HTML renderer can *conceptually* think of as its data source (even though it actually reads from `Report` directly). Est. 1–2 hours.

2. **#14 HTML second (Switch):** Self-contained HTML renderer with inline SVG charts. Builds directly on the confirmed `Report` type from #13's work. Est. 1–2 days.

3. **#15 /chronicle tips last (Tank):** This depends on #14 (HTML layout must exist first so Tank knows where to inject the insights section). Also carries the most uncertainty (subprocess scriptability). Deferring it means #14 ships clean and #15 augments it. Est. half day once scriptability is confirmed.

#12 (date range / `--all` / `--range`) is a parallel track — it extends session discovery and doesn't block any renderer. But landing it before or alongside #14 means the HTML report can immediately show the "credits over time" visual with real data.

---

## Top 3 Decisions I Need from robpitcher

### Decision 1 — Cross-session aggregation in HTML
**Question:** Should `tscope --html report.html` (with no other flags) show only today's sessions (same scope as the text renderer), OR should it default to `--all` to make the "credits over time" chart meaningful out of the box?
- **Option A:** Same scope as text (today only) — consistent mental model, date range is controlled by the same `--date`/`--all`/`--range` flags (#12)
- **Option B:** HTML defaults to `--all` — richer report by default, different from text renderer
- **My lean:** Option A. Consistency is more valuable than a clever default. The user can run `tscope --all --html report.html` when they want the full picture.

### Decision 2 — Auto-open browser (`--open`)
**Question:** Should `tscope --html report.html` automatically open the browser, or require an explicit `--open` flag?
- **My lean:** Default OFF (require `--open`). Surprise browser pops are annoying in scripts/CI. But if the primary use case is always "generate and view", make it default ON.

### Decision 3 — /chronicle tips: opt-in flag vs always-on with graceful skip
**Question:** Should chronicle tips be `--chronicle-tips` (explicit opt-in) or always attempted when generating HTML (with silent skip if unavailable)?
- **My lean:** Explicit opt-in (`--chronicle-tips`). Avoids a subprocess call on every `--html` run, and the user controls when they want insights vs just a cost report.
