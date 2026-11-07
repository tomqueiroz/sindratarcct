import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import noDirectApiRequest from "./eslint-rules/no-direct-api-request.js";

const local = {
  rules: {
    "no-direct-api-request": noDirectApiRequest
  }
};

export default tseslint.config(
  {
    ignores: ["dist/**", "dist-ssr/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.es2022
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      "react-hooks": reactHooks,
      local
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/exhaustive-deps": "warn",
      "local/no-direct-api-request": "error"
    }
  },
  {
    files: ["eslint.config.js", "eslint-rules/**/*.js", "scripts/**/*.mjs", "vite.config.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    rules: {
      "no-empty": "off",
      "local/no-direct-api-request": "off"
    }
  }
);
