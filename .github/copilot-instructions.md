# GitHub Copilot instructions for tscope

This repo uses Changesets to manage versioning and release notes for any user-visible or package-visible change.

## When to add a changeset

Add a `.changeset/*.md` file whenever a change is user-facing, package-visible, or would affect release notes, including:

- CLI behavior changes
- bug fixes shipped to npm
- new features or flags
- documentation updates intended to ship with a release
- workflow or release automation changes that affect how the package is published

Do not add a changeset for purely internal refactors, test-only changes, or non-shipping documentation unless the change is intended for a release.

## How to add one

Run:

```bash
npx changeset
```

Then:

- choose `patch`, `minor`, or `major`
- write a user-focused summary for the changelog
- commit the generated `.changeset/*.md` file with the code change

## Release-tool compatibility

This repo uses `@changesets/cli` v3 with `changesets/action` v2. Changesets CLI v3 requires Node.js 22.11 or newer for contributor and release tooling. Keep the CLI, action, Changesets config schema, and release workflow Node version compatible when updating any of them.

## Required workflow for agents

When making a change in this repo:

1. determine whether it is user-facing or release-visible
2. if yes, create or update a changeset
3. keep the changeset in the same commit or PR as the corresponding change
4. do not leave a shipping change unversioned
