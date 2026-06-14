---
"tscope": patch
---

Fix OTel context window parsing: read the correct span-event attribute keys (`github.copilot.current_tokens` and `github.copilot.token_limit`) so the context window size displays correctly in the dashboard.
