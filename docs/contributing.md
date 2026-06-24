# Contributing

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/robpitcher/tscope/issues).

Pull requests are welcome. For local development setup, see [Development](development.md).

## CI checks

Every pull request is expected to pass these checks:

- `npm run lint`
- `npm run build`
- `npm test`
- `aw-compile-check` for Agentic Workflow source/generated file sync

If you edit Agentic Workflow source files under `.github/workflows/*.md`, generated workflow files under `.github/workflows/*.lock.yml`, or `.github/workflows/agentics-maintenance.yml`, run:

```bash
gh aw compile
```

Then commit any updated `.github/workflows/*.lock.yml` files and `.github/workflows/agentics-maintenance.yml`. The `aw-compile-check` workflow fails when generated workflow files are out of date.

## Roadmap / Future Features

- **Session comparison** — diff token usage across sessions

## License

MIT. See the repository for details.
