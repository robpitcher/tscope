---
"tscope": minor
---

Add automatic rotation and pruning for the OTel export file to bound unbounded growth. The live file is automatically rotated to numbered archives (.1, .2, ...) when it exceeds 20 MB (configurable), and old archives are pruned to keep only the 5 most recent (configurable). Archives are seamlessly read for historical reports. Features include:

- **Auto-rotation (opportunistic)**: Rotates during normal `tscope` reads; disable with `TSCOPE_OTEL_AUTOROTATE=0`
- **Manual control**: Use `tscope otel prune` with options like `--max-size`, `--keep`, `--force`, `--dry-run`, `-y`
- **Configuration**: Environment variables `TSCOPE_OTEL_MAX_SIZE`, `TSCOPE_OTEL_KEEP`
- **Status reporting**: `tscope otel status` now shows rotation configuration and file/archive sizes
- **Concurrency-safe**: Atomic rename on POSIX; graceful error handling on Windows
