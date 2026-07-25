---
name: "agent-collaboration"
description: "Standard collaboration patterns for agents working in this repo — worktree awareness, decision recording, cross-agent communication"
domain: "team-workflow"
confidence: "high"
source: "earned"
---

## Context

Agents working on tscope share a few conventions for worktree awareness, decision
recording, and knowing when to hand work off. This skill collects them.

## Patterns

### Worktree Awareness

Work may happen in a git worktree rather than the main checkout. Run
`git rev-parse --show-toplevel` to find the repo root; never assume CWD is the root.
All repo-relative paths in this skill are relative to that root.

### Decision Recording

After making a decision that affects how the project is built — architecture, data
model, tooling, workflow ownership — append an entry to `docs/decisions.md` under
`## Active Decisions`, newest first:

```
## {decision title} ({date})

**Status:** Active

{the decision, and why}
```

Entries older than a week move to `docs/decisions-archive.md`.

### Cross-Agent Communication

If a change needs input outside your area, say so explicitly in your response rather
than guessing. Don't expand scope into work you can't validate.

### Reviewer Protocol

If you reject someone's work as a reviewer, say who should own the revision. The
original author shouldn't silently re-submit the same artifact.

## Anti-Patterns

- Don't rewrite or reorder existing entries in `docs/decisions.md` — append only
- Don't assume CWD is the repo root — resolve it with git
- Don't record a decision that only affects one file; use a code comment instead
