# Development

## Project Structure

```
tscope/
├── src/
│   ├── index.ts              # CLI entry point, argument parsing
│   ├── discovery.ts          # Session discovery logic
│   ├── parser.ts             # events.jsonl parsing
│   ├── filter.ts             # Date filtering (default: today)
│   ├── tokens.ts             # Token math / aggregation helpers
│   ├── types.ts              # TypeScript types
│   ├── render/
│   │   ├── Renderer.ts       # Renderer interface
│   │   ├── TextRenderer.ts   # Text output implementation
│   │   ├── JsonRenderer.ts   # JSON output (schema v4)
│   │   └── HtmlRenderer.ts   # HTML dashboard
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
