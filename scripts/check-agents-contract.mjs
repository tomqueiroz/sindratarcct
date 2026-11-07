/**
 * Scaffold-contract consistency check (L1).
 *
 * AGENTS.md is returned verbatim by the platform's init_project (`agents_md`)
 * and is the ONLY scaffold context the generating agent sees — it must never
 * lie about this repo's source. This check fails the build when:
 *
 *   1. the contract marker/version is missing,
 *   2. a public export of a contract-covered file is not mentioned in
 *      AGENTS.md (rename/removal without a contract update),
 *   3. the contract's ```sql exemplar is no longer an excerpt of
 *      apps/server/migrations/001_init.sql,
 *   4. a ```ts exemplar imports a symbol that its source module no longer
 *      exports.
 *
 * Run via `pnpm lint` (wired into scripts/lint.mjs) or directly:
 *   node scripts/check-agents-contract.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT_MARKER = "scaffold-contract: v2";

/**
 * Files whose public exports the contract must mention. `allow` lists exports
 * that are deliberately NOT part of the contract (scaffold-internal helpers
 * the generating agent never calls directly).
 */
const COVERED_FILES = [
  {
    path: "apps/server/_core/db.ts",
    allow: [
      "SqlArgs",
      "QueryResult",
      "DatabaseErrorCode",
      "StorageFileRecord",
      "NewStorageFileRecord",
      "UserRecord",
      "AuthSessionRecord",
      "ThirdPartyUserInput",
      "insertStorageFile",
      "updateStorageFile",
      "findStorageFileById",
      "findStorageFileByIdForUser",
      "findStorageFileByPath",
      "upsertThirdPartyUser",
      "createAuthSessionRecord"
    ]
  },
  {
    path: "apps/server/_core/auth.ts",
    allow: [
      "AuthSession",
      "enabledSocialProviders",
      "enabledThirdPartySocialProviders",
      "toAuthUser",
      "toAuthSession"
    ]
  },
  {
    path: "apps/server/_core/route-registry.ts",
    // Registry internals; the contract documents the *behavior* (auto-mount,
    // isPublic), not these exports.
    allow: ["RouteEntry", "routeEntries", "publicApiPrefixes"]
  },
  {
    path: "apps/server/middlewares/with-session.ts",
    allow: ["PUBLIC_API_PREFIXES"]
  },
  {
    path: "apps/server/_core/public-url.ts",
    allow: []
  },
  {
    path: "packages/shared/src/http.ts",
    allow: ["ApiSuccess", "ApiFailure", "ApiResponse"]
  },
  {
    path: "apps/client/src/lib/api.ts",
    allow: ["ApiFetchInit"]
  },
  {
    path: "apps/client/src/lib/api-base.ts",
    allow: []
  },
  {
    path: "apps/client/src/lib/auth.ts",
    allow: []
  },
  {
    path: "apps/server/services/s3_storage.ts",
    allow: ["StorageFileStatus", "StorageError", "StorageErrorStatus", "storageGet"]
  },
  {
    path: "apps/server/services/message.ts",
    allow: [
      "SendEmailInput",
      "SendMerchantEventNoticeInput",
      "TemplateEmailInput",
      "MessageServiceError",
      "sendTemplateEmail"
    ]
  }
];

/** Import sources inside ts exemplars → repo files that must export them. */
const EXEMPLAR_IMPORT_MAP = {
  "../_core/db": "apps/server/_core/db.ts",
  "../db/schema": "apps/server/db/schema.ts",
  "../services/todos": "apps/server/services/todos.ts",
  "@repo/shared/http": "packages/shared/src/http.ts"
};

const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

const errors = [];
const contract = read("AGENTS.md");

// 1. Marker.
if (!contract.split("\n", 1)[0].includes(CONTRACT_MARKER)) {
  errors.push(`AGENTS.md first line must contain "${CONTRACT_MARKER}"`);
}

// 2. Export coverage.
const EXPORT_RE = /^export\s+(?:async\s+)?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/gm;
for (const { path, allow } of COVERED_FILES) {
  let source;
  try {
    source = read(path);
  } catch {
    errors.push(`covered file missing: ${path} (update COVERED_FILES or restore the file)`);
    continue;
  }
  for (const match of source.matchAll(EXPORT_RE)) {
    const name = match[1];
    if (allow.includes(name)) continue;
    if (!contract.includes(name)) {
      errors.push(
        `${path} exports "${name}" but AGENTS.md never mentions it — ` +
          `document it in the contract or add it to the allowlist in scripts/check-agents-contract.mjs`
      );
    }
  }
}

// Helper: extract fenced code blocks of a given language from the contract.
function codeBlocks(lang) {
  const blocks = [];
  const re = new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g");
  for (const match of contract.matchAll(re)) {
    blocks.push(match[1]);
  }
  return blocks;
}

// 3. SQL exemplar must be an excerpt of the real migration (whitespace- and
// comment-insensitive).
const normalizeSql = (text) =>
  text
    .split("\n")
    .map((line) => line.split("--")[0].trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");

const sqlBlocks = codeBlocks("sql");
if (sqlBlocks.length === 0) {
  errors.push("AGENTS.md has no ```sql exemplar block");
} else {
  const migration = normalizeSql(read("apps/server/migrations/001_init.sql"));
  for (const block of sqlBlocks) {
    if (!migration.includes(normalizeSql(block))) {
      errors.push(
        "AGENTS.md sql exemplar diverged from apps/server/migrations/001_init.sql"
      );
    }
  }
}

// 4. ts exemplar imports must resolve to real exports.
const IMPORT_RE = /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*"([^"]+)"/g;
for (const block of codeBlocks("ts")) {
  for (const match of block.matchAll(IMPORT_RE)) {
    const source = match[2];
    const target = EXEMPLAR_IMPORT_MAP[source];
    if (!target) continue; // bare npm module (hono, zod, drizzle-orm)
    let targetSource;
    try {
      targetSource = read(target);
    } catch {
      errors.push(`exemplar imports from "${source}" but ${target} is missing`);
      continue;
    }
    const symbols = match[1]
      .split(",")
      .map((s) => s.replace(/\btype\b/, "").trim())
      .filter(Boolean);
    for (const symbol of symbols) {
      if (!targetSource.includes(symbol)) {
        errors.push(
          `AGENTS.md ts exemplar imports "${symbol}" from "${source}" but ` +
            `${target} does not export it`
        );
      }
    }
  }
}

// 5. Anchors: scaffold-contract.anchors.json lists the paths/symbols the
// website skill's guide and tools assume about this scaffold. Validating it
// here means a template MR that breaks one of those expectations goes red in
// THIS repo's lint, even when nobody touches oh-my-agent.
//
// Cross-repo status (keep honest): a mirrored authoritative copy for
// oh-my-agent (tests/template_anchors.json + tests/test_template_contract.py,
// which asserts the two copies stay identical) exists on oh-my-agent branch
// feat-website-scaffold-contract but has NOT merged to its main yet. Until it
// does, this script is the only gate — editing the JSON here is NOT backstopped
// by oma CI. Once it lands, change the two copies only together.
let anchors = null;
try {
  anchors = JSON.parse(read("scaffold-contract.anchors.json"));
} catch {
  errors.push(
    "scaffold-contract.anchors.json missing or invalid JSON — restore it from " +
      "git history (mirror: oh-my-agent tests/template_anchors.json on branch " +
      "feat-website-scaffold-contract)"
  );
}
if (anchors) {
  for (const rel of anchors.paths ?? []) {
    try {
      read(rel);
    } catch (readError) {
      if (readError.code === "EISDIR") continue; // directories count as present
      errors.push(`oma anchor path missing: ${rel}`);
    }
  }
  for (const [rel, symbols] of Object.entries(anchors.symbols ?? {})) {
    let text;
    try {
      text = read(rel);
    } catch {
      errors.push(`oma anchor file missing: ${rel}`);
      continue;
    }
    for (const symbol of symbols) {
      if (!text.includes(symbol)) {
        errors.push(
          `oma anchor symbol "${symbol}" not found in ${rel} — the website ` +
            `skill depends on it; update scaffold-contract.anchors.json in the ` +
            `same MR (and coordinate with oh-my-agent tests/template_anchors.json ` +
            `on branch feat-website-scaffold-contract once that gate lands)`
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`\n[check-agents-contract] ${errors.length} problem(s):\n`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error(
    "\nAGENTS.md is the scaffold contract served to the generating agent via " +
      "init_project; it must stay aligned with the source it describes.\n"
  );
  process.exit(1);
}

console.log("[check-agents-contract] OK — contract matches scaffold source");
