// Home-page prerender for the CSR (vite + react + BrowserRouter) client workspace.
//
// Runs after `vite build` from apps/client. It SSR-renders the home route once
// and bakes the resulting markup into dist/index.html's #root, so crawlers that
// don't execute JS still see real content. The client then hydrates it back into
// the normal CSR app.
import { readFileSync, writeFileSync, rmSync } from "fs";
import { relative, resolve, sep } from "path";
import React from "react";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import _generate from "@babel/generator";
import * as t from "@babel/types";

const traverse = _traverse.default ?? _traverse;
const generate = _generate.default ?? _generate;

const ROOT_RE = /<div\s+id=["']root["'][^>]*>([\s\S]*?)<\/div>/;
const RESERVED_GLOBALS = new Set(["undefined", "globalThis", "global", "window", "self"]);
const SKIPPED = Symbol("prerender skipped");
const SRC_EXT_RE = /\.[cm]?[jt]sx?$/;

function warnAndSkip(msg, err) {
  console.warn(`[prerender] skipped: ${msg}`);
  if (err) console.warn(err?.stack || String(err));
  return SKIPPED;
}

function installBrowserGlobals(window) {
  Object.defineProperty(globalThis, "window", { value: window, writable: true, configurable: true });
  Object.defineProperty(globalThis, "self", { value: window, writable: true, configurable: true });

  for (const key of Reflect.ownKeys(window)) {
    if (typeof key !== "string" || RESERVED_GLOBALS.has(key)) {
      continue;
    }

    const sourceDescriptor = Object.getOwnPropertyDescriptor(window, key);
    const targetDescriptor = Object.getOwnPropertyDescriptor(globalThis, key);

    if (!sourceDescriptor || targetDescriptor) {
      continue;
    }

    try {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        enumerable: sourceDescriptor.enumerable,
        get: () => window[key],
        set: (value) => {
          window[key] = value;
        },
      });
    } catch {}
  }

  if (typeof globalThis.matchMedia !== "function") {
    Object.defineProperty(globalThis, "matchMedia", {
      value: () => ({
        matches: false,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
      }),
      writable: true,
      configurable: true,
    });
  }
}

function isUppercaseName(name) {
  return typeof name === "string" && /^[A-Z]/.test(name);
}

function calleeName(callee) {
  if (t.isIdentifier(callee)) {
    return callee.name;
  }

  if (t.isMemberExpression(callee) && !callee.computed && t.isIdentifier(callee.property)) {
    return callee.property.name;
  }

  return "";
}

function callExpression(objectName, propertyName, args = []) {
  return t.callExpression(
    t.memberExpression(t.identifier(objectName), t.identifier(propertyName)),
    args
  );
}

function createCatchBody(componentName) {
  return t.blockStatement([
    t.expressionStatement(
      callExpression("console", "warn", [
        t.stringLiteral(`[prerender] skipped failed component: ${componentName}`),
        t.identifier("error"),
      ])
    ),
    t.returnStatement(t.nullLiteral()),
  ]);
}

function wrapStatements(statements, componentName) {
  return [
    t.tryStatement(
      t.blockStatement(statements),
      t.catchClause(t.identifier("error"), createCatchBody(componentName))
    ),
  ];
}

function isAlreadyWrapped(body) {
  return body.body.length === 1 && t.isTryStatement(body.body[0]);
}

function wrapFunctionBody(fn, componentName) {
  if (!fn.body) {
    return false;
  }

  if (t.isBlockStatement(fn.body)) {
    if (isAlreadyWrapped(fn.body)) {
      return false;
    }

    fn.body.body = wrapStatements(fn.body.body, componentName);
    return true;
  }

  const expression = fn.body;
  fn.body = t.blockStatement(wrapStatements([t.returnStatement(expression)], componentName));
  return true;
}

function wrapClassRender(classNode, componentName) {
  let rewrites = 0;

  for (const member of classNode.body.body) {
    if (
      (t.isClassMethod(member) || t.isClassPrivateMethod(member)) &&
      t.isIdentifier(member.key) &&
      member.key.name === "render" &&
      member.body &&
      !isAlreadyWrapped(member.body)
    ) {
      member.body.body = wrapStatements(member.body.body, componentName);
      rewrites += 1;
    }
  }

  return rewrites;
}

function shouldTransformSource(cwd, id) {
  const cleanId = id.split("?", 1)[0];
  if (!SRC_EXT_RE.test(cleanId)) {
    return false;
  }

  const srcDir = resolve(cwd, "src");
  const rel = relative(srcDir, cleanId);
  return Boolean(rel && !rel.startsWith("..") && !rel.split(sep).includes("node_modules"));
}

function createPrerenderSafeRenderPlugin(cwd) {
  return {
    name: "prerender-safe-render",
    enforce: "pre",
    transform(code, id) {
      if (!shouldTransformSource(cwd, id)) {
        return null;
      }

      let ast;
      try {
        ast = parse(code, {
          sourceType: "module",
          plugins: ["typescript", "jsx", "classProperties", "classPrivateProperties", "classPrivateMethods"],
        });
      } catch (error) {
        console.warn(`[prerender] safe render transform skipped ${id}`, error);
        return null;
      }

      let rewrites = 0;

      traverse(ast, {
        FunctionDeclaration(path) {
          const name = path.node.id?.name;
          if (isUppercaseName(name) && wrapFunctionBody(path.node, name)) {
            rewrites += 1;
          }
        },

        VariableDeclarator(path) {
          if (!t.isIdentifier(path.node.id) || !isUppercaseName(path.node.id.name) || !path.node.init) {
            return;
          }

          const name = path.node.id.name;
          const init = path.node.init;

          if ((t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) && wrapFunctionBody(init, name)) {
            rewrites += 1;
            return;
          }

          if (t.isClassExpression(init)) {
            rewrites += wrapClassRender(init, name);
          }
        },

        ClassDeclaration(path) {
          const name = path.node.id?.name;
          if (isUppercaseName(name)) {
            rewrites += wrapClassRender(path.node, name);
          }
        },

        CallExpression(path) {
          const name = calleeName(path.node.callee);
          if (name !== "memo" && name !== "forwardRef") {
            return;
          }

          const component = path.node.arguments[0];
          if (!component || (!t.isFunctionExpression(component) && !t.isArrowFunctionExpression(component))) {
            return;
          }

          const declarator = path.findParent((parentPath) => parentPath.isVariableDeclarator());
          const declaratorName = declarator?.isVariableDeclarator() && t.isIdentifier(declarator.node.id)
            ? declarator.node.id.name
            : "AnonymousComponent";
          const componentName = component.id?.name ?? declaratorName;

          if (wrapFunctionBody(component, componentName)) {
            rewrites += 1;
          }
        },
      });

      if (!rewrites) {
        return null;
      }

      return {
        code: generate(ast, { retainLines: true, sourceMaps: false }, code).code,
        map: null,
      };
    },
  };
}

async function run() {
  const cwd = process.cwd();
  const htmlPath = resolve(cwd, "dist/index.html");

  let template;
  try {
    template = readFileSync(htmlPath, "utf-8");
  } catch (e) {
    return warnAndSkip(`cannot read ${htmlPath}`, e);
  }
  if (!ROOT_RE.test(template)) {
    return warnAndSkip("no <div id=\"root\"> in dist/index.html (self-contained HTML?)");
  }

  // Idempotent: if #root already holds baked markup (e.g. the npm postbuild hook
  // ran AND the build pipeline also invokes this script), do nothing. A second
  // pass would re-match the non-greedy ROOT_RE against nested markup and corrupt
  // the HTML.
  const existing = template.match(ROOT_RE);
  if (existing && existing[1].trim()) {
    console.log("[prerender] skipped: #root already prerendered");
    return SKIPPED;
  }

  let window = null;
  try {
    const { build } = await import("vite");
    const { default: reactPlugin } = await import("@vitejs/plugin-react");
    const { componentTagger } = await import("lovable-tagger");
    await build({
      configFile: false,
      logLevel: "error",
      plugins: [createPrerenderSafeRenderPlugin(cwd), componentTagger(), reactPlugin()],
      resolve: { alias: { "@": resolve(cwd, "src") } },
      build: {
        ssr: true,
        rollupOptions: {
          input: "./src/App.tsx",
          external: ["react", "react-dom", "react-dom/server"],
          output: { format: "es", entryFileNames: "App.js" },
        },
        outDir: "dist-ssr",
        emptyOutDir: true,
      },
      ssr: { noExternal: true },
    });

    const { Window } = await import("happy-dom");
    window = new Window({
      url: "http://localhost:3000",
      settings: {
        disableJavaScriptFileLoading: true,
        disableJavaScriptEvaluation: true,
        disableCSSFileLoading: true,
      },
    });
    installBrowserGlobals(window);

    const { renderToString } = await import("react-dom/server");
    const { default: App } = await import(`${resolve(cwd, "dist-ssr/App.js")}?prerender=${Date.now()}`);
    const html = renderToString(React.createElement(App));

    if (!html.trim()) return warnAndSkip("empty SSR output");

    // Function replacement is load-bearing: with a string replacement,
    // $-sequences in the SSR html hit GetSubstitution ($1 = ROOT_RE's only
    // capture group = empty shell content), silently deleting "$1".."$9"
    // from page text (e.g. "NT$1,200" baked as "NT,200").
    const rendered = template.replace(ROOT_RE, () => `<div id="root">${html}</div>`);
    writeFileSync(htmlPath, rendered);
    console.log("[prerender] home page baked into dist/index.html");
  } catch (e) {
    return warnAndSkip("render failed", e);
  } finally {
    try { if (window?.happyDOM) await window.happyDOM.close(); } catch {}
    try { rmSync(resolve(cwd, "dist-ssr"), { recursive: true, force: true }); } catch {}
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(0));
