---
"tscope": patch
---

Tighten the published npm package surface. `ParsedArgs`, `parseArgs`, and `buildFilterDescription` were accidentally exported from the CLI entry point (`dist/index.d.ts`) with no library use case; they are now internal to a new `src/args.ts` module and no longer part of the public API. Added an `"exports"` field to `package.json` that restricts consumers to the root entry point, blocking deep imports like `tscope/dist/sources/merge`. Also removed the dead `.npmignore` (superseded by the `"files"` whitelist) and disabled `declarationMap` (unused since `src/` is not published).
