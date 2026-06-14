# Development

## Project Structure

```
tscope/
├── src/
│   ├── index.ts              # CLI entry point, argument parsing
│   ├── discovery.ts          # Session discovery logic
│   ├── parser.ts             # events.jsonl parsing
│   ├── filter.ts             # Date filtering and recency limiting
│   ├── tokens.ts             # Token math / aggregation helpers
│   ├── types.ts              # TypeScript types
│   ├── render/
│   │   ├── Renderer.ts       # Renderer interface
│   │   ├── index.ts          # Renderer registry and factory
│   │   ├── TextRenderer.ts   # Text output implementation
│   │   ├── JsonRenderer.ts   # JSON output (schema v5)
│   │   └── HtmlRenderer.ts   # HTML dashboard
│   ├── sources/
│   │   ├── logsSource.ts     # Log-file data source (events.jsonl)
│   │   ├── otelSource.ts     # OTel data source (otel.jsonl)
│   │   └── merge.ts          # OTel + logs merge helpers
│   └── __tests__/            # Unit and integration tests
├── docs/                     # Documentation (you are here)
├── package.json              # Dependencies, scripts, metadata
├── tsconfig.json             # TypeScript config
└── README.md                 # Project overview
```

## Build

```bash
npm run build
```

Compiles TypeScript to the `dist/` directory.

## Test

```bash
npm test
```

Runs tests via Jest.

## Lint

```bash
npm run lint
```

Runs ESLint on TypeScript source.

## Development Mode

```bash
npm run dev
```

Runs directly via `ts-node` (no build step).
