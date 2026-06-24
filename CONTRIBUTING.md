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
| `npm run changeset` | Create a changeset describing your PR (see [Releases](#releases)) |

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
3. **Add a changeset** if your PR should ship to users — see [Releases](#releases).
4. Open a PR against `main`. Fill in the PR template — it's short.
5. A reviewer will take a look. For anything beyond a small fix, it's worth opening an issue first to align on scope before writing code.

**Commit messages:** Write clear, descriptive messages in plain English. No enforced format — just make it obvious what changed and why.

## CI checks

Every pull request is expected to pass these checks:

- `npm run lint`
- `npm run build`
- `npm test`
- `aw-compile-check` for Agentic Workflow source/generated file sync

If you edit Agentic Workflow source files under `.github/workflows/*.md`, run:

```bash
gh aw compile
```

Then commit any updated `.github/workflows/*.lock.yml` files and `.github/workflows/agentics-maintenance.yml`. The `aw-compile-check` workflow fails when generated workflow files are out of date.

## Releases

We use [Changesets](https://github.com/changesets/changesets) to manage versioning and publish to npm. The release flow is automated — your job as a contributor is just to add a changeset when your PR should ship.

### Adding a changeset

If your PR includes a user-facing change (bug fix, feature, behavior change), run:

```bash
npx changeset
```

You'll be prompted to:

1. Pick a bump type: **patch** (bug fix), **minor** (new feature, backward-compatible), or **major** (breaking change).
2. Write a short summary — this becomes the entry in `CHANGELOG.md`, so write it for users, not reviewers.

The command creates a markdown file under `.changeset/` (e.g. `.changeset/witty-pandas-dance.md`). **Commit that file with your PR.**

Skip the changeset for changes that don't need to ship: docs, tests, CI, internal refactors with no behavior change.

### What happens after your PR merges

1. The Release workflow sees pending changesets on `main` and opens (or updates) a PR titled **"chore(release): version packages"** that bumps `package.json` and updates `CHANGELOG.md`.
2. A maintainer reviews and merges that PR.
3. The workflow runs again, sees the bumped version, and publishes to npm + creates a GitHub Release with the changelog notes.

You don't need to bump `package.json` yourself — Changesets does it.

## Be respectful

Treat everyone with respect. This is an alpha project built by a small team; keep feedback constructive and discussion focused on the work.

## Alpha caveat

tscope is early-stage software. Behavior, output format, and JSON schema may change between versions. If you're building on top of tscope, pin your version and keep an eye on releases.
