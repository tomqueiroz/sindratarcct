// Build-time route collection for sitemap generation.
//
// Parses src/App.tsx with Babel and writes dist/sitemap-routes.json. The access
// layer can later combine these relative paths with the request domain to serve
// /sitemap.xml without asking the model to hand-write sitemap XML.
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";

const traverse = _traverse.default ?? _traverse;

const DEFAULT_INPUT = "src/App.tsx";
const DEFAULT_OUTPUT = "dist/sitemap-routes.json";
const EXCLUDED_PREFIXES = ["/api", "/assets", "/publish", "/.well-known"];
const EXCLUDED_FILES = new Set([
  "/favicon.ico",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
]);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
    } else if (arg === "--output" && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function normalizeRoutePath(routePath) {
  const trimmed = String(routePath ?? "").trim();
  if (!trimmed || trimmed === "*") {
    return null;
  }

  const withoutHash = trimmed.split("#", 1)[0];
  const withoutQuery = withoutHash.split("?", 1)[0];
  const normalized = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

function isIndexableStaticRoute(routePath) {
  if (!routePath || routePath.includes(":") || routePath.includes("*")) {
    return false;
  }

  const lower = routePath.toLowerCase();
  if (EXCLUDED_FILES.has(lower)) {
    return false;
  }

  return !EXCLUDED_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`));
}

function staticStringFromJSXAttribute(attribute) {
  if (!attribute || !t.isJSXAttribute(attribute)) {
    return null;
  }

  const value = attribute.value;
  if (t.isStringLiteral(value)) {
    return value.value;
  }
  if (t.isJSXExpressionContainer(value) && t.isStringLiteral(value.expression)) {
    return value.expression.value;
  }
  return null;
}

function jsxName(node) {
  if (t.isJSXIdentifier(node)) {
    return node.name;
  }
  if (t.isJSXMemberExpression(node)) {
    return jsxName(node.property);
  }
  return "";
}

export function collectSitemapRoutesFromSource(source, filename = DEFAULT_INPUT) {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
    sourceFilename: filename,
  });

  const routes = new Set();

  traverse(ast, {
    JSXOpeningElement(path) {
      if (jsxName(path.node.name) !== "Route") {
        return;
      }

      const pathAttribute = path.node.attributes.find((attribute) => (
        t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name) && attribute.name.name === "path"
      ));
      const routePath = normalizeRoutePath(staticStringFromJSXAttribute(pathAttribute));

      if (isIndexableStaticRoute(routePath)) {
        routes.add(routePath);
      }
    },
  });

  return Array.from(routes).sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a.localeCompare(b);
  });
}

function writeRoutesManifest(outputPath, routes, inputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify({
      version: 1,
      source: inputPath,
      generatedAt: new Date().toISOString(),
      routes,
    }, null, 2)}\n`
  );
}

function run() {
  const cwd = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolve(cwd, args.input);
  const outputPath = resolve(cwd, args.output);
  const source = readFileSync(inputPath, "utf-8");
  const routes = collectSitemapRoutesFromSource(source, args.input);

  writeRoutesManifest(outputPath, routes, args.input);
  console.log(`[sitemap-routes] wrote ${routes.length} routes to ${args.output}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
