import { RuleTester } from "eslint";
import rule from "./no-direct-api-request.js";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module"
  }
});

const message = 'no fetch, use apiFetch from "@/lib/api"';

ruleTester.run("no-direct-api-request", rule, {
  valid: [
    {
      code: 'import { apiFetch } from "@/lib/api";\napiFetch("/api/todos");',
      filename: "/repo/apps/client/src/pages/home/Index.tsx"
    },
    {
      code: 'fetch(apiUrl(path));',
      filename: "/repo/apps/client/src/lib/api.ts"
    },
    {
      code: 'fetch("/api/todos");',
      filename: "/repo/apps/client/src/pages/home/Index.test.tsx"
    },
    {
      code: 'import axios from "axios";',
      filename: "/repo/apps/client/src/__mocks__/network.ts"
    }
  ],
  invalid: [
    {
      code: 'fetch("/api/todos");',
      filename: "/repo/apps/client/src/pages/home/Index.tsx",
      errors: [{ message }]
    },
    {
      code: 'window.fetch("/api/todos");',
      filename: "/repo/apps/client/src/pages/home/Index.tsx",
      errors: [{ message }]
    },
    {
      code: 'globalThis.fetch("/api/todos");',
      filename: "/repo/apps/client/src/pages/home/Index.tsx",
      errors: [{ message }]
    },
    {
      code: "new XMLHttpRequest();",
      filename: "/repo/apps/client/src/pages/home/Index.tsx",
      errors: [{ message }]
    },
    {
      code: 'import axios from "axios";\naxios.get("/api/todos");',
      filename: "/repo/apps/client/src/pages/home/Index.tsx",
      errors: [{ message }]
    },
    {
      code: 'axios.create({ baseURL: "/api" });',
      filename: "/repo/apps/client/src/pages/home/Index.tsx",
      errors: [{ message }]
    },
    {
      code: 'const axios = require("axios");',
      filename: "/repo/apps/client/src/pages/home/Index.tsx",
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "script"
      },
      errors: [{ message }]
    }
  ]
});
