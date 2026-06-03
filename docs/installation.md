# Installation

## Global Install (Recommended)

```bash
npm install -g tscope
```

Then run:

```bash
tscope
```

## From Source

```bash
git clone https://github.com/devjoy-pub/tscope.git
cd tscope
npm install
npm run build
npm install -g .
# or `npm link` for local development
```

## Requirements

- **Node.js 18.0.0 or later** (see the `engines` field in `package.json`).
- No network access required at runtime — `tscope` only reads local session files.

## Verifying the Install

```bash
tscope --version
tscope --help
```

If `tscope` is not on your `PATH` after a global install, confirm that your npm global `bin` directory is on `PATH`:

```bash
npm bin -g
```
