---
applyTo: ".github/workflows/*.md,.github/workflows/*.lock.yml,.github/workflows/aw-compile-check.yml,.github/aw/*"
---

# Bumping the `gh aw` version

`gh aw compile` SHA-pins `github/gh-aw-actions/*` by resolving the tag via the
GitHub API, and **silently emits a bare `@vX.Y.Z` ref if that call fails** (e.g. a
SAML-restricted local token). `.github/aw/actions-lock.json` is what keeps this
deterministic offline — never drop entries from it, or `aw-compile-check.yml`
will fail on lock files that look fine locally.

1. Bump `version:` and the `setup-cli` SHA pin in `aw-compile-check.yml`.
2. Add `setup@vX.Y.Z` + `setup-cli@vX.Y.Z` to `actions-lock.json` (same SHA).
3. Run `gh aw compile`; verify refs are SHA-pinned, not bare tags.
4. Commit `*.lock.yml`, `agentics-maintenance.yml`, and `actions-lock.json` together.
