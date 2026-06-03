module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: {
    es2020: true,
    jest: true,
    node: true,
  },
  ignorePatterns: ["dist/", "coverage/", "node_modules/"],
  rules: {
    "no-empty": ["error", { allowEmptyCatch: true }],
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
};
