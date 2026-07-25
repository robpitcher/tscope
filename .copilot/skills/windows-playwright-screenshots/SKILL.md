---
name: "windows-playwright-screenshots"
description: "Captures Playwright screenshots on Windows in PowerShell — covers heredoc workaround, ad-hoc package install, and Windows-specific flags."
domain: "testing, documentation, screenshots"
confidence: "high"
source: "earned"
---

## Context

When regenerating dashboard screenshots on Windows (e.g., updating `docs/images/dashboard-light.png`
and `docs/images/dashboard-dark.png`), the Linux-style `node --input-type=module <<'EOF'` heredoc
in the workflow doc does not work in PowerShell. Use the file-based workaround below.

Applies any time Playwright screenshots need to be captured locally on Windows, including when
following `.github/workflows/update-docs.md` section 6.

## Patterns

### 1. Build the project first (no `npm ci` if deps already installed)
```powershell
cd C:\your\repo
npm run build
```

### 2. Generate the synthetic HTML preview
```powershell
node scripts\screenshot-dashboard.mjs
# Verify:
Get-Item dashboard-preview.html | Select-Object Length
```

### 3. Install Playwright Chromium (Windows: omit `--with-deps`)
```powershell
npx --yes playwright install chromium
# `--with-deps` is Linux-only — omit on Windows or it errors.
```

### 4. Install the `playwright` npm package ad-hoc (not in package.json)
```powershell
npm install --no-save playwright
```

### 5. Write capture script to a file (heredocs don't work in PowerShell)
Create `capture-screenshots.mjs` in repo root:
```js
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlFile = `file://${path.resolve(__dirname, 'dashboard-preview.html')}`;

const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(htmlFile, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: `docs/images/dashboard-${scheme}.png`,
    fullPage: true,
  });
  await ctx.close();
  console.log(`Captured dashboard-${scheme}.png`);
}
await browser.close();
```

### 6. Run the capture script
```powershell
node capture-screenshots.mjs
```

### 7. Verify results
```powershell
Get-Item "docs\images\dashboard-light.png", "docs\images\dashboard-dark.png" | Select-Object Name, Length, LastWriteTime
```

### 8. Clean up build artifacts
```powershell
Remove-Item dashboard-preview.html, capture-screenshots.mjs -Force
```

## Examples

Reference run (2026-06-13):
- Before: light=538,643 bytes, dark=541,821 bytes (dated 6/12/2026)
- After:  light=196,678 bytes, dark=200,190 bytes (dated 6/13/2026)
- Workflow doc: `.github/workflows/update-docs.md` section 6

## Anti-Patterns

- ❌ Do NOT use `--with-deps` on `playwright install chromium` — Windows only, causes errors.
- ❌ Do NOT use PowerShell heredoc (`<<'EOF'`) — it does not exist in PowerShell.
- ❌ Do NOT run `npm ci` if dependencies are already installed — `npm run build` is sufficient.
- ❌ Do NOT forget `npm install --no-save playwright` — `playwright` is not in package.json; the `npx playwright install chromium` step only downloads the browser, it does not make the npm package importable.
- ❌ Do NOT leave `dashboard-preview.html` or `capture-screenshots.mjs` in the repo — they are build artifacts and should be deleted after use.
