import sharedConfig from "./eslint/base.mjs";

export default [
  ...sharedConfig,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        URL: "readonly",
      },
    },
  },
];
