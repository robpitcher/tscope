---
skill: inline-js-validation
author: switch
created: 2026-06-13T09:53:03-04:00
---

# Skill: Validating Emitted Inline JavaScript Parses

## Problem

tscope renders a self-contained HTML file with all JS inlined as `<script>${JS}</script>`. The `JS` constant is a TypeScript template literal. This creates a subtle trap: **escape sequences inside the template literal are resolved by TypeScript at build time**, not at runtime in the browser.

Common footgun:

```typescript
const JS = `
  // This looks like a JS string with \n escape sequence...
  if (s.indexOf('\n') !== -1) { ... }
  // But TypeScript resolves '\n' → raw LF (0x0A) in the string value.
  // The emitted HTML will have a raw newline inside a single-quoted JS string → SyntaxError.
`;
```

Because all IIFEs share a single `<script>` block, **one SyntaxError anywhere kills all client-side behaviour**.

## Rule

When writing JS inside a TypeScript template literal that will be emitted as HTML `<script>` content:

- **Never use bare `'\n'`, `'\r'`, `'\r\n'`** inside single-quoted or double-quoted string literals
- **Use `'\\n'`, `'\\r'`, `'\\r\\n'`** so the emitted JS contains the proper escape sequence
- Unicode escapes like `'\u2600'` resolve to the actual character — that character is valid in a string literal (not a line terminator), so it's fine

## Regression Guard Pattern

Always add (or maintain) a `new Function()` parse test:

```typescript
test("inline <script> body parses as valid JavaScript", () => {
  const html = renderToString(report, "html-test-script-parse.html");
  // Extract the executable <script> block (last <script> before </body>)
  const m = html.match(/<script>([\s\S]+?)<\/script>\s*<\/body>/);
  expect(m).not.toBeNull();
  expect(() => new Function(m![1])).not.toThrow();
});
```

`new Function(body)` parses `body` as a JavaScript function body. Any SyntaxError in the emitted JS will surface here, including raw-newline bugs.

## Checklist When Editing `const JS`

- [ ] All single/double-quoted string literals: no raw `\n`, `\r`, `\r\n` — use `\\n`, `\\r`, `\\r\\n`
- [ ] Regex literals using `\n`/`\r`: these are fine — regex literals don't need double-escaping in templates
- [ ] After editing, run the `new Function()` regression test

## Applies To

Any project that builds self-contained HTML files with inline JS from TypeScript template literals.
