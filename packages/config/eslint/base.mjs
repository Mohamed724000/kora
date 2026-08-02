import eslint from "@eslint/js";
import typescriptEslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/**", "coverage/**", ".next/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  ...typescriptEslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "no-warning-comments": [
        "error",
        {
          location: "anywhere",
          terms: ["todo", "fixme"],
        },
      ],
    },
  },
];
