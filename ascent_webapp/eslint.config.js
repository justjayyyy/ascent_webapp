import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";
import pluginPlaywright from "eslint-plugin-playwright";

const unused = {
  "no-unused-vars": "off",
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": ["error", { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
};

export default [
  { ignores: ["dist/**", "node_modules/**", "dev-dist/**", "src/components/ui/**", "public/**"] },

  // The web app
  {
    files: ["src/**/*.{js,jsx,mjs}"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: { react: pluginReact, "react-hooks": pluginReactHooks, "unused-imports": pluginUnusedImports },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...pluginReact.configs.flat.recommended.rules,
      ...unused,
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/display-name": "off",
      "react/no-unescaped-entities": "off",
      "react/no-unknown-property": ["error", { ignore: ["cmdk-input-wrapper", "toast-close"] }],
      "react-hooks/rules-of-hooks": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // The API, shared code, scripts and tests run on Node
  {
    files: ["server/**/*.{js,mjs}", "shared/**/*.{js,mjs}", "api/**/*.js", "src/**/*.test.mjs", "*.config.js"],
    languageOptions: { globals: { ...globals.node }, ecmaVersion: 2022, sourceType: "module" },
    plugins: { "unused-imports": pluginUnusedImports },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...unused,
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  // Browser tests: Node, plus the page's globals inside page.evaluate()
  {
    files: ["e2e/**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser }, ecmaVersion: 2022, sourceType: "module" },
    plugins: { "unused-imports": pluginUnusedImports, playwright: pluginPlaywright },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...pluginPlaywright.configs["flat/recommended"].rules,
      ...unused,
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Lint runs with --quiet, so what keeps the suite steady is an error, not a warning: no sleeping, no
      // forcing clicks past what a person could do, nothing left paused, focused or skipped without a reason
      "playwright/no-wait-for-timeout": "error",
      "playwright/no-wait-for-selector": "error",
      "playwright/no-force-option": "error",
      "playwright/no-page-pause": "error",
      "playwright/no-element-handle": "error",
      "playwright/no-skipped-test": ["error", { allowConditional: true }],
    },
  },
];
