import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const assetsRoot = resolve(root, ".skywork/business-template-assets/crm");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireFile(path) {
  assert.ok(existsSync(path), `expected ${path} to exist`);
  return readFileSync(path, "utf8");
}

const catalog = readJson(resolve(assetsRoot, "catalog.json"));
assert.equal(catalog.schemaVersion, 2);
assert.equal(catalog.id, "crm-website-preset-v1");
assert.equal(catalog.projectMode, "standard-self-host-website");
assert.equal(catalog.entryPath, "/");
assert.equal(catalog.agentGuide.templatePath, "AGENTS.crm.md");
assert.equal(catalog.agentGuide.generatedPath, "AGENTS.crm.md");
assert.equal(catalog.runtimeContractPath, "runtime-contract.json");
assert.equal(catalog.sourceRegistrySchemaPath, "source-registry.schema.json");
assert.equal(catalog.uiFoundation.version, 1);
assert.equal(catalog.uiFoundation.sourcePath, "ui-foundation");
assert.equal(catalog.uiFoundation.targetPath, "apps/client/src/crm/foundation");
assert.equal(catalog.uiFoundation.entryPath, "apps/client/src/crm/foundation/index.ts");
assert.equal(catalog.auth.defaultMode, "local-admin-v1");
assert.equal(catalog.auth.presetPath, "auth/local-admin-v1");
assert.equal(catalog.auth.contractPath, "auth/local-admin-v1/contract.json");
assert.equal(catalog.auth.overlayRoot, "auth/local-admin-v1/overlay");
assert.equal(catalog.telemetry.defaultMode, "sls-activity-v1");
assert.equal(catalog.telemetry.presetPath, "telemetry/sls-activity-v1");
assert.equal(catalog.telemetry.contractPath, "telemetry/sls-activity-v1/contract.json");
assert.equal(catalog.telemetry.overlayRoot, "telemetry/sls-activity-v1/overlay");
assert.equal(catalog.validation.generatedInspectorPath, "scripts/inspect-crm-state.mjs");
assert.ok(catalog.materialization.deletePaths.includes("apps/server/migrations/000_auth.sql"));
assert.ok(catalog.materialization.deletePaths.includes("apps/server/migrations/002_storage_files.sql"));
assert.ok(!catalog.materialization.deletePaths.includes("apps/server/routes/storage.route.ts"));
assert.ok(!catalog.materialization.deletePaths.includes("apps/server/services/s3_storage.ts"));
assert.ok(catalog.materialization.deletePaths.includes("apps/server/routes/todos.route.ts"));
assert.doesNotMatch(JSON.stringify(catalog), /embedded|__skywork\/crm|business_crm_access/i);

for (const legacyPath of [
  "auth/embedded-auth-v1",
  "common",
  "shell"
]) assert.equal(existsSync(resolve(assetsRoot, legacyPath)), false, `legacy CRM asset must not exist: ${legacyPath}`);

const guide = requireFile(resolve(assetsRoot, catalog.agentGuide.templatePath));
for (const required of [
  "Required Execution Order",
  ".skywork/web-apps.json",
  "source-registry.json",
  "source-registry.schema.json",
  "Source Capabilities",
  "source-registry schema v2",
  "CRM services own operator-side authorization",
  "CRM route -> CRM service -> typed adapter -> shared Website database",
  "requiredRelations",
  "select one customer",
  "unpublish is not archive",
  "draft-only precondition",
  "SKU-level inventory",
  "runtime-reference/publish-contract.md",
  "Non-matching sources do not read or install the publish-chain package",
  "sourceWebsiteId",
  "crm_",
  "For images managed in CRM and displayed by a source Website, use the existing `/api/storage` API",
  "CRM migrations must not create or alter `storage_files`",
  "first successfully registered account becomes the administrator",
  "shared authenticated CRM Shell",
  "direct member access must preserve the Shell",
  "error states are fail closed",
  "filter it once into `visibleNavigation`",
  "pass that same result to desktop and mobile navigation",
  "React Router client-side navigation",
  "CRM Information Architecture",
  "CRM Functional Requirements",
  "visible primary navigation for its business modules",
  "selected scenario's visual language",
  "those requirements take precedence over the selected scenario reference",
  "compact operator-console composition",
  "source Website selector",
  "Filter, Refresh, Create, and pagination",
  "Do not render Notifications, Help Centre",
  "CRM Activity Telemetry (Preset-gated, Best-effort)",
  "handleCrmMutation",
  "crmMutationSuccess",
  "executeCrmMutation",
  "CRM-specific write-operation wrapper around the root guide's `apiFetch`",
  "read/list requests use `apiFetch` directly",
  "every declared Registry write operation must use `executeCrmMutation`",
  "Expected descriptors are browser-local receipt-matching metadata only",
  "preloadCrmTelemetryContext",
  "browser best-effort",
  "do not hand-write a fallback tracker",
  "Website Traffic Analytics (Required Generation, Fail-open Runtime)",
  "generationPolicy=required_when_declared",
  "completing every declared required binding is a required generation task before validation",
  "generation-plan ordering only",
  "apps/server/routes/crm-website-traffic.route.ts",
  "exports a Hono router",
  "GET /api/crm-website-traffic",
  "CrmMetricGrid columns={4}",
  "Do not invent region/device distributions, trends, series, growth rates, or cross-Website totals",
  "Do not add generated-project coverage reporters",
  "CRM inspector `ready` means the generated project has the required structural contract",
  "It does not certify CRM workflows, RBAC behavior, mutations, source invariants, or browser interactions",
  "record its ID in `.skywork/crm/selection.json`",
  "ui-reference/CrmScenarioReference.tsx",
  "At handoff, report the selected scenario"
]) assert.match(guide, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
assert.doesNotMatch(guide, /schemaFingerprint|bindingFingerprint|validatedSourceHash|sourceHashMatches/);
assert.match(guide, /Do not use schema fingerprints or stale hashes/i);
assert.doesNotMatch(guide, /website skill/i);

for (const foundationFile of [
  "index.ts", "types.ts", "status-colors.ts", "CrmAppShell.tsx", "CrmSidebar.tsx",
  "CrmMobileNavigation.tsx", "CrmToolbar.tsx", "CrmMetricGrid.tsx", "CrmTrendChart.tsx",
  "CrmStatusChart.tsx", "CrmDataTable.tsx", "CrmPagination.tsx"
]) requireFile(resolve(assetsRoot, catalog.uiFoundation.sourcePath, foundationFile));

const sharedReference = requireFile(resolve(assetsRoot, "ui-reference/CrmScenarioReference.tsx"));
assert.match(sharedReference, /from "\.\.\/ui-foundation"/);
assert.match(sharedReference, /CrmAppShell/);
assert.match(sharedReference, /CrmToolbar/);

const runtime = readJson(resolve(assetsRoot, catalog.runtimeContractPath));
assert.equal(runtime.schemaVersion, 2);
assert.equal(runtime.id, "crm-runtime-contract-v2");
assert.equal(runtime.paths.workspaceManifest, ".skywork/web-apps.json");
assert.equal(runtime.paths.sourceRegistry, "apps/server/crm/source-registry.json");
assert.equal(runtime.paths.sourceRegistrySchema, ".skywork/crm/templates/source-registry.schema.json");
assert.equal(runtime.paths.adapterPattern, "apps/server/crm/adapters/<websiteId>.ts");
assert.equal(Object.hasOwn(runtime.paths, "validationResult"), false);
assert.equal(Object.hasOwn(runtime, "validation"), false);
assert.deepEqual(runtime.identity.supportStatuses, ["supported", "unsupported"]);
assert.equal(runtime.identity.querySourceIdField, "sourceWebsiteId");
assert.equal(runtime.identity.querySourceNameField, "sourceName");
assert.equal(runtime.ownership.crmTablePrefix, "crm_");
assert.deepEqual(runtime.analytics.websiteTraffic, {
  servicePath: "apps/server/services/website_visit_stats.ts",
  routePath: "/api/crm-website-traffic",
  generationPolicy: "required_when_declared",
  runtimeFailurePolicy: "fail_open",
  requiredBindings: ["server_route", "client_query", "dashboard_panel"],
  rangeDays: [1, 7, 30],
  metricFields: ["pv", "uv", "avg_visit_depth", "avg_duration_seconds"]
});
const websiteVisitStatsHelper = requireFile(resolve(root, runtime.analytics.websiteTraffic.servicePath));
for (const required of [
  "process.env.SKYWORK_GATEWAY_BASE_URL",
  "process.env.SKYWORK_API_TOKEN",
  "/api/website/visit/stats",
  "X-Skywork-Api-Token",
  "AbortSignal.timeout",
  "not_configured",
  "upstream_unavailable",
  "avg_visit_depth",
  "avg_duration_seconds"
]) assert.match(websiteVisitStatsHelper, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(websiteVisitStatsHelper, /regions|devices/);
const serverTsconfig = readJson(resolve(root, "apps/server/tsconfig.json"));
assert.equal(serverTsconfig.compilerOptions.resolveJsonModule, true);
assert.equal(runtime.telemetry.schemaVersion, 1);
assert.equal(runtime.telemetry.eventName, "crm_activity_event");
assert.deepEqual(runtime.telemetry.writeOperationKinds, ["create", "update", "archive", "delete", "adjust", "reserve", "release", "transition"]);
assert.deepEqual(runtime.telemetry.excludedOperationKinds, ["list", "read"]);
assert.equal(runtime.telemetry.serverHelperPath, "apps/server/crm/telemetry/activity.ts");
assert.equal(runtime.telemetry.clientHelperPath, "apps/client/src/crm/telemetry/execute-crm-mutation.ts");
assert.equal(runtime.telemetry.runtimeContextRoute, "/api/crm-runtime-context");
assert.equal(runtime.telemetry.rawGatewayEnv, "SKYWORK_GATEWAY_BASE_URL");
assert.deepEqual(runtime.telemetry.requiredRuntimeEnv, ["SKYWORK_GATEWAY_BASE_URL", "SKYWORK_WORKSPACE_ID", "SKYWORK_WEBSITE_ID", "SKYWORK_ENV"]);
assert.deepEqual(runtime.telemetry.gatewayResolution, {
  missingOrInvalid: "disabled",
  tiangongCn: "china-sls",
  fallback: "global-sls"
});
assert.equal(runtime.telemetry.delivery, "browser-best-effort");
assert.ok(runtime.telemetry.piiDenylist.includes("entity_id"));
assert.ok(!runtime.telemetry.eventInfoFields.includes("entity_id"));

const telemetryRoot = resolve(assetsRoot, catalog.telemetry.presetPath);
const telemetryContract = readJson(resolve(assetsRoot, catalog.telemetry.contractPath));
assert.equal(telemetryContract.schemaVersion, 1);
assert.equal(telemetryContract.id, "crm-sls-activity-v1");
assert.equal(telemetryContract.mode, catalog.telemetry.defaultMode);
assert.equal(telemetryContract.overlayRoot, "overlay");
assert.ok(Array.isArray(telemetryContract.requiredOverlayFiles));
const requiredTelemetryOverlayFiles = [
  "packages/shared/src/crm-activity.ts",
  "apps/server/crm/telemetry/activity.ts",
  "apps/server/crm/telemetry/runtime-context.ts",
  "apps/server/routes/crm-runtime-context.route.ts",
  "apps/server/__tests__/crm-activity.test.ts",
  "apps/server/__tests__/crm-runtime-context.test.ts",
  "apps/client/src/crm/telemetry/runtime-context.ts",
  "apps/client/src/crm/telemetry/runtime-context.test.ts",
  "apps/client/src/crm/telemetry/sls-tracker.ts",
  "apps/client/src/crm/telemetry/sls-tracker.test.ts",
  "apps/client/src/crm/telemetry/execute-crm-mutation.ts",
  "apps/client/src/crm/telemetry/execute-crm-mutation.test.ts",
  "apps/client/src/crm/telemetry/index.ts"
];
assert.deepEqual(telemetryContract.requiredOverlayFiles, requiredTelemetryOverlayFiles);
for (const path of requiredTelemetryOverlayFiles) requireFile(resolve(telemetryRoot, telemetryContract.overlayRoot, path));

const sharedCrmActivity = requireFile(resolve(telemetryRoot, telemetryContract.overlayRoot, "packages/shared/src/crm-activity.ts"));
assert.match(sharedCrmActivity, /CRM_ACTIVITY_EVENT_NAME/);
assert.match(sharedCrmActivity, /CrmMutationApiSuccess/);
assert.match(sharedCrmActivity, /isCrmActivityReceipt/);
assert.match(sharedCrmActivity, /isCrmTelemetryRuntimeContext/);
assert.doesNotMatch(sharedCrmActivity, /entity_id/);

const telemetryRuntimeContext = requireFile(resolve(telemetryRoot, telemetryContract.overlayRoot, "apps/server/crm/telemetry/runtime-context.ts"));
assert.match(telemetryRuntimeContext, /process\.env\[name\]/);
assert.doesNotMatch(telemetryRuntimeContext, /from ["'].*_core\/env/);
assert.match(telemetryRuntimeContext, /endsWith\(`\.\$\{rootDomain\}`\)/);
assert.match(telemetryRuntimeContext, /tiangong\.cn/);
assert.match(telemetryRuntimeContext, /skywork\.ai/);
assert.match(telemetryRuntimeContext, /enabled: false/);

const telemetryActivity = requireFile(resolve(telemetryRoot, telemetryContract.overlayRoot, "apps/server/crm/telemetry/activity.ts"));
assert.match(telemetryActivity, /apiSuccess\(data\)/);
assert.match(telemetryActivity, /meta:\s*\{/);
assert.match(telemetryActivity, /randomUUID\(\)/);
assert.match(telemetryActivity, /export async function handleCrmMutation/);
assert.match(telemetryActivity, /const data = await mutate\(\)/);
assert.ok(telemetryActivity.indexOf("await mutate()") < telemetryActivity.indexOf("descriptorFor(data)"));
assert.doesNotMatch(telemetryActivity, /entity_id/);
assert.doesNotMatch(telemetryActivity, /data\.result/);

const telemetryRoute = requireFile(resolve(telemetryRoot, telemetryContract.overlayRoot, "apps/server/routes/crm-runtime-context.route.ts"));
assert.match(telemetryRoute, /protectedRoute/);
assert.match(telemetryRoute, /getCrmTelemetryRuntimeContext\(c\.var\.currentUser\.id\)/);

const telemetryMutationClient = requireFile(resolve(telemetryRoot, telemetryContract.overlayRoot, "apps/client/src/crm/telemetry/execute-crm-mutation.ts"));
assert.match(telemetryMutationClient, /apiFetch\(path, init\)/);
assert.match(telemetryMutationClient, /response\.clone\(\)/);
assert.match(telemetryMutationClient, /type CrmActivityExpectation/);
assert.match(telemetryMutationClient, /receiptMatchesExpectedActivity/);
assert.match(telemetryMutationClient, /expectedActivity\?: CrmActivityExpectation/);
assert.match(telemetryMutationClient, /consumeCrmMutationActivity\(response\.clone\(\), expectedActivity\)/);
assert.doesNotMatch(telemetryMutationClient, /apiFetch\(path, init, expectedActivity\)/);
assert.doesNotMatch(telemetryMutationClient, /sendCrmActivity\([^,]+, expectedActivity\)/);
assert.doesNotMatch(telemetryMutationClient, /data\.result/);

const telemetryMutationClientTest = requireFile(resolve(telemetryRoot, telemetryContract.overlayRoot, "apps/client/src/crm/telemetry/execute-crm-mutation.test.ts"));
assert.match(telemetryMutationClientTest, /multi-source expectation/);
assert.match(telemetryMutationClientTest, /mismatched expected descriptor without changing the response/);
assert.match(telemetryMutationClientTest, /mock\.calls\[0\].*\["\/products", init\]/);

const telemetryClientRuntimeContext = requireFile(resolve(telemetryRoot, telemetryContract.overlayRoot, "apps/client/src/crm/telemetry/runtime-context.ts"));
assert.match(telemetryClientRuntimeContext, /if \(!token\) return Promise\.resolve\(disabledContext\(\)\)/);
assert.match(telemetryClientRuntimeContext, /apiFetch\("\/crm-runtime-context", \{ silent: true \}\)/);

const clientApi = requireFile(resolve(root, "apps/client/src/lib/api.ts"));
assert.match(clientApi, /silent\?: boolean/);
assert.match(clientApi, /if \(!response\.ok && !silent\)/);

const telemetryTracker = requireFile(resolve(telemetryRoot, telemetryContract.overlayRoot, "apps/client/src/crm/telemetry/sls-tracker.ts"));
assert.match(telemetryTracker, /@aliyun-sls\/web-track-browser/);
assert.match(telemetryTracker, /sendImmediate/);
assert.match(telemetryTracker, /Promise\.resolve\(delivery\)\.catch/);
assert.match(telemetryTracker, /event_info:\s*JSON\.stringify\(receipt\)/);
assert.doesNotMatch(telemetryTracker, /window\.location|href:/);
assert.doesNotMatch(telemetryTracker, /entity_id/);
for (const path of requiredTelemetryOverlayFiles.filter((path) => path.endsWith(".ts") && !path.includes(".test."))) {
  const source = requireFile(resolve(telemetryRoot, telemetryContract.overlayRoot, path));
  if (path.endsWith("sls-tracker.ts")) continue;
  assert.doesNotMatch(source, /@aliyun-sls\/web-track-browser/);
}

const clientPackage = readJson(resolve(root, "apps/client/package.json"));
assert.equal(clientPackage.dependencies["@aliyun-sls/web-track-browser"], "^0.3.9");
assert.match(requireFile(resolve(root, "pnpm-lock.yaml")), /@aliyun-sls\/web-track-browser@0\.3\.9/);

const sourceRegistrySchema = readJson(resolve(assetsRoot, catalog.sourceRegistrySchemaPath));
assert.equal(sourceRegistrySchema.$id, "https://skywork.ai/schemas/crm/source-registry-v2.json");
assert.equal(sourceRegistrySchema.additionalProperties, false);
assert.match(sourceRegistrySchema.description, /allowlist for generated CRM UI actions and server operations/i);
assert.deepEqual(sourceRegistrySchema.required, ["schemaVersion", "sources"]);
assert.equal(sourceRegistrySchema.$defs.source.additionalProperties, false);
assert.equal(sourceRegistrySchema.$defs.entity.additionalProperties, false);
assert.equal(sourceRegistrySchema.$defs.relationship.additionalProperties, false);
assert.equal(sourceRegistrySchema.$defs.operation.additionalProperties, false);
assert.match(sourceRegistrySchema.$defs.operation.description, /CRM-executable capability/i);
assert.deepEqual(sourceRegistrySchema.$defs.operation.required, ["id", "kind", "adapterMethod"]);
assert.ok(sourceRegistrySchema.$defs.operation.properties.kind.enum.includes("transition"));
assert.ok(sourceRegistrySchema.$defs.operation.properties.kind.enum.includes("reserve"));
assert.ok(sourceRegistrySchema.examples[0].sources.some((source) => source.supportStatus === "supported"));
assert.ok(sourceRegistrySchema.examples[0].sources.some((source) => source.supportStatus === "unsupported"));

const physicalCommerceRoot = resolve(assetsRoot, "scenarios/physical-commerce-v1");
const physicalCommerceContract = readJson(resolve(physicalCommerceRoot, "contract.json"));
assert.deepEqual(physicalCommerceContract.operatorCapabilities.products, ["list", "read", "create", "update", "publish", "unpublish", "archive"]);
assert.deepEqual(physicalCommerceContract.operatorCapabilities.customers, ["list", "read", "create", "update", "archive"]);
assert.deepEqual(physicalCommerceContract.operatorCapabilities.orders, ["list", "read", "create", "update_status", "mark_paid", "mark_shipped", "mark_delivered", "cancel", "delete_draft"]);
assert.deepEqual(physicalCommerceContract.operatorCapabilities.inventory, ["list", "adjust", "reserve", "release"]);
assert.deepEqual(physicalCommerceContract.optionalOperatorCapabilities.skus, ["list", "read", "create", "update", "archive"]);
assert.ok(physicalCommerceContract.relationshipRequirements.some((relationship) => relationship.entity === "orders" && relationship.targetEntity === "customers" && relationship.required));
assert.match(physicalCommerceContract.operationSemantics.products, /(?:unpublish.*not.*archive|archive.*not.*unpublish)/i);
assert.match(physicalCommerceContract.operationSemantics.orders, /linked to one customer.*draft/i);
assert.match(physicalCommerceContract.operationSemantics.customers, /Archive customers/i);
assert.match(physicalCommerceContract.operationSemantics.inventory, /SKU/i);
const physicalCommerceFixture = readJson(resolve(physicalCommerceRoot, "ui-reference/fixture.json"));
for (const site of physicalCommerceFixture.sites) {
  const orderTab = site.tabs.find((tab) => tab.id === "orders");
  assert.ok(orderTab.actions.includes("Delete draft order"));
  const productTab = site.tabs.find((tab) => tab.id === "products");
  assert.ok(productTab.actions.includes("Publish product"));
  assert.ok(productTab.actions.includes("Unpublish product"));
}

const digitalCommerceRoot = resolve(assetsRoot, "scenarios/digital-commerce-v1");
const digitalCommerceContract = readJson(resolve(digitalCommerceRoot, "contract.json"));
assert.deepEqual(digitalCommerceContract.operatorCapabilities.products, ["list", "create", "update", "publish", "unpublish", "archive"]);
assert.ok(digitalCommerceContract.requiredScenarioChecks.includes("publish-chain-contract"));
assert.ok(digitalCommerceContract.invariantTopics.some((topic) => /publish contract/i.test(topic)));
assert.equal(digitalCommerceContract.runtimeReference.version, 1);
assert.deepEqual(digitalCommerceContract.runtimeReference.assets, [
  "runtime-reference/publish-contract.md",
  "runtime-reference/slugify.ts",
  "runtime-reference/publish-chain.test.template.ts"
]);
assert.match(digitalCommerceContract.runtimeReference.note, /report the degradation/i);
assert.match(digitalCommerceContract.runtimeReference.note, /slug or image field alone/i);
assert.match(digitalCommerceContract.runtimeReference.note, /unpublish transition back to a legal publish from-state/i);
const publishContractReference = requireFile(resolve(digitalCommerceRoot, "runtime-reference/publish-contract.md"));
for (const required of [
  "source registry remains authoritative",
  "SLUG_CONFLICT",
  "CRM never creates a token",
  "both uploads persist",
  "product-revision CAS",
  "no active cover row exists",
  "Consumer visibility depends only on the published lifecycle state",
  "optional `unpublish` harness"
]) assert.match(publishContractReference, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
const slugifyAsset = requireFile(resolve(digitalCommerceRoot, "runtime-reference/slugify.ts"));
assert.match(slugifyAsset, /export function slugify/);
assert.match(slugifyAsset, /SLUG_TEST_VECTORS/);
assert.ok(slugifyAsset.includes('"/test2"'), "slugify vectors must keep the incident case /test2");
assert.ok(slugifyAsset.includes("^[a-z0-9]+(?:-[a-z0-9]+)*$"), "slugify must keep the canonical SLUG_PATTERN");
const publishChainTemplate = requireFile(resolve(digitalCommerceRoot, "runtime-reference/publish-chain.test.template.ts"));
assert.match(publishChainTemplate, /__CRM_CONTRACT_HARNESS_MODULE__/);
assert.match(publishChainTemplate, /__CRM_CONTRACT_SLUGIFY_MODULE__/);
assert.match(publishChainTemplate, /NO_RENDERABLE_COVER/);
assert.match(publishChainTemplate, /SLUG_CONFLICT/);
assert.match(publishChainTemplate, /INVALID_STATE/);
assert.match(publishChainTemplate, /attemptPublishCas/);
assert.match(publishChainTemplate, /revision/);
assert.match(publishChainTemplate, /exactly one cover/i);
assert.ok(publishChainTemplate.includes("data:image/png"), "grammar reject vectors must cover data: URIs");
assert.ok(publishChainTemplate.includes('"https:///x"'), "grammar reject vectors must cover degenerate URLs (empty host)");
assert.match(publishChainTemplate, /new URL\(/);
assert.match(publishChainTemplate, /sellableSkuCount/);
assert.match(publishChainTemplate, /legalPublishFromStates/);
assert.match(publishChainTemplate, /forceSlug/);
assert.match(publishChainTemplate, /forceHeroImage/);
assert.match(publishChainTemplate, /createProductWithHeroImage/);
assert.match(publishChainTemplate, /knownSeedToken\?/);
assert.match(publishChainTemplate, /SLUG_INVALID/);
assert.ok(publishChainTemplate.includes("addSku?("), "addSku must stay optional for product-only sources");
assert.match(publishChainTemplate, /hasSkuSupport/);
assert.ok(publishChainTemplate.includes("unpublish?("), "unpublish harness must stay optional");
assert.match(publishChainTemplate, /hasUnpublishRepublishLoop/);
assert.doesNotMatch(publishChainTemplate, /rawQuery|pragma_index_list|sqlite_master/);
assert.match(publishChainTemplate, /no browser, server, network, or fixed port/i);
assert.match(digitalCommerceContract.runtimeReference.note, /product-only source/i);

const authRoot = resolve(assetsRoot, catalog.auth.presetPath);
const authContract = readJson(resolve(assetsRoot, catalog.auth.contractPath));
assert.equal(authContract.accessMode, "local-admin-v1");
assert.equal(authContract.bootstrap.publicBetterAuthSignup, "blocked");
assert.equal(authContract.bootstrap.productionSeedAdmin, false);
assert.equal(authContract.administration.pageMode, "crm-shell-child");
assert.equal(authContract.administration.fallbackPath, "/");
assert.deepEqual(authContract.administration.navigation, {
  id: "settings-users",
  visibility: "active-admin",
  sharedAcrossDesktopAndMobile: true
});
assert.equal(authContract.administration.lastActiveAdminProtection, true);
assert.equal(authContract.administration.deactivationRevokesSessions, true);
for (const required of [
  "concurrent-bootstrap-single-admin",
  "direct-public-signup-closed",
  "admin-create-user",
  "last-active-admin-protected",
  "deactivation-revokes-sessions"
]) assert.ok(authContract.validation.requiredChecks.includes(required));

const overlayRoot = resolve(authRoot, "overlay");
const requiredOverlayFiles = [
  "apps/server/_core/auth.ts",
  "apps/server/_core/create-app.ts",
  "apps/server/db/crm-auth-schema.ts",
  "apps/server/middlewares/with-session.ts",
  "apps/server/migrations/000_crm_auth.sql",
  "apps/server/migrations/010_crm_support.sql",
  "apps/server/services/crm-auth/bootstrap.ts",
  "apps/server/services/crm-auth/admin-users.ts",
  "apps/server/routes/crm-auth.route.ts",
  "apps/server/routes/crm-users.route.ts",
  "apps/client/src/pages/auth/Index.tsx",
  "apps/client/src/pages/settings/Users.tsx",
  "apps/server/__tests__/crm-local-admin.test.ts",
  "scripts/check-agents-contract.mjs"
];
for (const path of requiredOverlayFiles) requireFile(resolve(overlayRoot, path));
assert.equal(existsSync(resolve(overlayRoot, "AGENTS.crm.md")), false);
const usersSettingsPage = requireFile(resolve(overlayRoot, "apps/client/src/pages/settings/Users.tsx"));
assert.match(usersSettingsPage, /<section\s+aria-labelledby=["']crm-users-title["']/);
assert.match(usersSettingsPage, /<h1\s+id=["']crm-users-title["']/);
assert.doesNotMatch(usersSettingsPage, /<main\b/);
assert.doesNotMatch(usersSettingsPage, /\b(?:CrmAppShell|CrmSidebar|CrmMobileNavigation|BrowserRouter)\b/);
assert.doesNotMatch(usersSettingsPage, /\b(?:window\.location|location\.assign)\b/);
const overlayGuideChecker = requireFile(resolve(overlayRoot, "scripts/check-agents-contract.mjs"));
for (const required of [
  "unique `webApps[]` entry whose `type` is `crm`",
  "first successful `/auth` bootstrap registration",
  "record its ID in `.skywork/crm/selection.json`",
  "ui-reference/CrmScenarioReference.tsx",
  "At handoff, report the selected scenario"
]) assert.match(overlayGuideChecker, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const authSchema = requireFile(resolve(overlayRoot, "apps/server/db/crm-auth-schema.ts"));
for (const table of authContract.tables) assert.match(authSchema, new RegExp(`[\"]${table}[\"]`));
const createApp = requireFile(resolve(overlayRoot, "apps/server/_core/create-app.ts"));
assert.match(createApp, /REGISTRATION_CLOSED/);
assert.match(createApp, /\/api\/auth\/sign-up\/email/);
const bootstrap = requireFile(resolve(overlayRoot, "apps/server/services/crm-auth/bootstrap.ts"));
assert.match(bootstrap, /WHERE singleton_key = 1 AND state = 'open'/);
assert.doesNotMatch(bootstrap, /COUNT\s*\(\s*(?:\*|user)/i);
assert.match(bootstrap, /claim_token/);
const adminUsers = requireFile(resolve(overlayRoot, "apps/server/services/crm-auth/admin-users.ts"));
assert.match(adminUsers, /LAST_ADMIN_REQUIRED/);
assert.match(adminUsers, /DELETE FROM crm_session/);
assert.match(adminUsers, /crm_audit_log/);

for (const name of ["000_crm_auth.sql", "010_crm_support.sql"]) {
  const sql = requireFile(resolve(overlayRoot, "apps/server/migrations", name));
  const objects = [...sql.matchAll(/\b(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+([A-Za-z_][A-Za-z0-9_]*)/gi)].map((match) => match[1]);
  assert.ok(objects.length > 0);
  for (const object of objects) assert.match(object, /^crm_/);
}

assert.deepEqual(catalog.scenarios.map((scenario) => scenario.id), [
  "physical-commerce-v1",
  "digital-commerce-v1",
  "offline-reservation-v1"
]);
assert.match(sharedReference, /resolveSiteTab/);
const foundationText = [
  "CrmToolbar.tsx", "CrmPagination.tsx", "CrmMobileNavigation.tsx", "CrmTrendChart.tsx", "CrmStatusChart.tsx"
].map((file) => requireFile(resolve(assetsRoot, catalog.uiFoundation.sourcePath, file))).join("\n");
for (const required of [
  'aria-label="Website"', "Refresh view", "Filter", "Rows per page", "PaginationPrevious", "PaginationNext",
  "CRM mobile sections", "Revenue trend", "Business status distribution"
]) assert.match(foundationText, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
const toolbarText = requireFile(resolve(assetsRoot, catalog.uiFoundation.sourcePath, "CrmToolbar.tsx"));
assert.match(toolbarText, /onFilter \? \(/);
assert.match(toolbarText, /onClick=\{onFilter\}/);
const trendChartText = requireFile(resolve(assetsRoot, catalog.uiFoundation.sourcePath, "CrmTrendChart.tsx"));
assert.match(trendChartText, /hasPoints/);
assert.match(trendChartText, /No trend data/);
assert.match(trendChartText, /points\.length === 1/);
assert.doesNotMatch(sharedReference, /Notifications|Help Centre/);
assert.doesNotMatch(sharedReference, /<header[\s\S]*?\bCreate\b[\s\S]*?<\/header>/);
assert.doesNotMatch(sharedReference, /<header/);
assert.doesNotMatch(sharedReference, /onFilter=\{\(\) => undefined\}/);
assert.doesNotMatch(sharedReference, /fixture\.title/);
assert.doesNotMatch(sharedReference, /Switch between connected websites and operate the products, customers, orders, and inventory owned by each site\./);
assert.doesNotMatch(sharedReference, /Workspace · \{site\.label\}/);

for (const scenario of catalog.scenarios) {
  const scenarioRoot = resolve(assetsRoot, scenario.path);
  assert.equal(scenario.contractPath, "contract.json");
  const contract = readJson(resolve(scenarioRoot, scenario.contractPath));
  const fixture = readJson(resolve(scenarioRoot, "ui-reference/fixture.json"));
  const wrapper = requireFile(resolve(scenarioRoot, "ui-reference/CrmScenarioReference.tsx"));
  const profile = readJson(resolve(scenarioRoot, "ui-profile.json"));
  assert.equal(contract.templateId, scenario.id);
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.kind, "crm-scenario-reference");
  assert.match(contract.purpose, /never a storage schema or business-rule authority/i);
  assert.ok(contract.referenceEntities.length >= 5);
  assert.ok(Object.keys(contract.operatorCapabilities).length >= 4);
  assert.ok(contract.invariantTopics.length >= 2);
  assert.ok(contract.requiredScenarioChecks.length >= 2);
  assert.equal(fixture.templateId, scenario.id);
  assert.equal(profile.schemaVersion, 1);
  assert.ok(profile.moduleOrder.includes("overview"));
  assert.ok(profile.moduleOrder.includes(profile.overviewStatusResource));
  assert.equal(profile.statusResourcePriority[0], profile.overviewStatusResource);
  assert.ok(profile.componentSlots.includes("shell") && profile.componentSlots.includes("toolbar") && profile.componentSlots.includes("status"));
  assert.equal(fixture.sites[0]?.id, "all");
  assert.ok(fixture.sites.length >= 4);
  for (const site of fixture.sites) {
    assert.ok(site.id && site.label);
    assert.ok(Array.isArray(site.tabs) && site.tabs.some((tab) => tab.id === "overview"));
    if (site.id !== "all") assert.ok(site.metrics?.length > 0);
  }
  assert.match(wrapper, /CrmScenarioReference/);
  const expectedScenarioEntries = ["contract.json", "ui-profile.json", "ui-reference"];
  if (contract.runtimeReference) {
    expectedScenarioEntries.push("runtime-reference");
    for (const asset of contract.runtimeReference.assets) requireFile(resolve(scenarioRoot, asset));
  }
  assert.deepEqual(
    readdirSync(scenarioRoot).filter((name) => !name.startsWith(".")).sort(),
    expectedScenarioEntries.sort()
  );
}

const contractJsonPaths = [
  "catalog.json",
  catalog.runtimeContractPath,
  catalog.auth.contractPath,
  catalog.telemetry.contractPath,
  ...catalog.scenarios.map((scenario) => `${scenario.path}/${scenario.contractPath}`)
];
assert.equal(contractJsonPaths.length, 7);
for (const path of contractJsonPaths) assert.doesNotMatch(requireFile(resolve(assetsRoot, path)), /\"rules\"\s*:/);
assert.equal(existsSync(resolve(assetsRoot, "validation/validation-result-contract.json")), false);

const inspector = requireFile(resolve(assetsRoot, catalog.validation.inspectorPath));
const inspectorTest = requireFile(resolve(assetsRoot, catalog.validation.inspectorTestPath));
assert.match(inspector, /runtime-contract\.json/);
assert.doesNotMatch(inspector, /sourceBindings|source-bindings/);
assert.match(inspector, /sourceRegistry/);
assert.doesNotMatch(inspector, /validationResult|validation\.json|validateLocalResult|needs_review/);
assert.doesNotMatch(inspector, /fingerprint/i);
assert.match(inspectorTest, /missingRuntimeContract/);

const lintSource = requireFile(resolve(root, "scripts/lint.mjs"));
assert.match(lintSource, /crm\/validation\/inspect-crm-state\.test\.mjs/);
assert.equal(readdirSync(resolve(assetsRoot, "scenarios")).filter((name) => !name.startsWith(".")).length, 3);

console.log("[check-crm-template-assets] OK");
