# Contributing to tscope

Thanks for your interest! tscope is in **alpha** — feedback, bug reports, and pull requests are all genuinely welcome. The bar for contributing is low; the main ask is that you be respectful and keep scope tight.

## Dev environment

**Requires Node.js 18+.**

```bash
git clone https://github.com/robpitcher/tscope.git
cd tscope
npm install
```

Key scripts:

| Script | What it does |
|--------|--------------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm test` | Run tests via Jest |
| `npm run lint` | Run ESLint on source |
| `npm run dev` | Run via ts-node (no build step needed) |

## How to run

After `npm run build`:

```bash
node dist/index.js
```

Or during development:

```bash
npm run dev
```

See [docs/usage.md](docs/usage.md) for CLI flags and examples.

## Filing issues

[Open an issue on GitHub](https://github.com/robpitcher/tscope/issues). Bug reports and feature requests both welcome — use the issue templates if you can, they ask for the right details.

Issues get the `squad` label by default, which triggers Lead triage. Once triaged, a `squad:{member}` label routes the issue to the right team member. You'll see these labels appear automatically — that's just the team workflow, nothing to worry about.

## Submitting pull requests

1. Fork the repo and create a branch.
2. Make your changes. Run `npm run build && npm test && npm run lint` before pushing.
3. Open a PR against `main`. Fill in the PR template — it's short.
4. A reviewer will take a look. For anything beyond a small fix, it's worth opening an issue first to align on scope before writing code.

**Commit messages:** Write clear, descriptive messages in plain English. No enforced format — just make it obvious what changed and why.

## Be respectful

Treat everyone with respect. This is an alpha project built by a small team; keep feedback constructive and discussion focused on the work.

## Alpha caveat

tscope is early-stage software. Behavior, output format, and JSON schema may change between versions. If you're building on top of tscope, pin your version and keep an eye on releases.
