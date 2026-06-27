---
"tscope": patch
---

Guarantee deterministic newest-first session ordering across all filter modes and output formats. Matched sessions are now sorted by start time before applying `--max`, so filtered reports consistently return the most recent sessions first.
