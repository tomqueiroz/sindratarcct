import type { Config } from "tailwindcss";

// Compatibility shim for lovable-tagger@1.1.x.
// The app uses Tailwind v4 via CSS-first config in src/index.css.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {}
  },
  plugins: []
} satisfies Config;
