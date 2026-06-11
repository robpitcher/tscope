---
"tscope": patch
---

`tscope otel enable` / `disable` now prompt for a Y/N confirmation instead of requiring the `--apply` flag. The command previews the change, then asks "Apply this change? [y/N]" — pressing `y`/`yes` writes the change; anything else cancels. The `--apply` flag has been removed.
