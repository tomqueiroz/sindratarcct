import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const native = read("../wordpress/pagina-cct-servico.html");
const snapshot = read("../../apps/client/src/lib/negotiations.ts");
const rows = [
  ["Força Sindical", "Novembro", "Negociações iniciadas"],
  ["FEM-CUT", "Setembro", "Assinado"],
  ["Conlutas", "Setembro", "Negociações iniciadas"],
  ["Intersindical", "Setembro", "Assinado"],
  ["Campinas", "Setembro", "Assinado"],
];
test("official five-base editorial snapshot and dates match native HTML", () => {
  assert.equal((snapshot.match(/baseMonth:/g) || []).length, 5);
  const tbody = native.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  assert.ok(tbody);
  assert.equal((tbody.match(/<tr>/g) || []).length, 5);
  for (const [name, month, status] of rows) {
    assert.ok(snapshot.includes(`name: "${name}", baseMonth: "${month}", status: "${status}"`));
    assert.ok(tbody.includes(`<th scope="row">${name}</th><td>${month}</td>`));
    assert.ok(tbody.match(new RegExp(`<th scope="row">${name}</th><td>${month}</td><td><span[^>]*>${status}</span>`)));
  }
  for (const value of ["2026-10-20T10:30:00-03:00", "20/10/2026 às 10h30",
    "https://sindratarsp.com.br/solicitar-convencao-coletiva-2/",
    "https://sindratarsp.com.br/consulta-de-municipios/"]) {
    assert.ok(snapshot.includes(value));
    assert.ok(native.includes(value));
  }
});
test("all native delivery aliases are exact copies, not stale flows", () => {
  for (const path of ["../wordpress/pagina-convencoes-sindratar.html",
    "../../apps/client/public/entrega/pagina-cct-servico.html",
    "../../apps/client/public/entrega/pagina-convencoes-sindratar.html"]) {
    assert.equal(read(path), native, path);
  }
});
test("brand uses reference fonts and cyan with dark readable control text", () => {
  const css = read("../../apps/client/src/index.css");
  const html = read("../../apps/client/index.html");
  const php = read("../wordpress/sindratar-cct.php");
  for (const content of [css, native]) {
    assert.ok(content.includes("#29abe2"));
    assert.ok(content.includes("#40c8ff"));
    assert.ok(content.includes("Montserrat"));
    assert.ok(content.includes('"Open Sans"'));
    assert.ok(content.includes("color:#0f0f0f"));
  }
  assert.ok(html.includes("family=Montserrat"));
  assert.ok(php.includes("family=Montserrat"));
  assert.ok(native.includes(".cct-embedded .cct-logo{display:none}"));
  assert.ok(php.includes('class="cct-embedded"'));
});
test("editorial status cannot become backend authorization and remains dated", () => {
  const ui = read("../../apps/client/src/components/cct/Negotiations.tsx");
  const faqs = read("../../apps/client/src/lib/service-form.ts");
  for (const content of [ui, native]) {
    assert.ok(content.includes("não uma consulta em tempo real"));
    assert.ok(content.includes("documento vigente no catálogo"));
  }
  assert.ok(faqs.includes("O status “Assinado” significa que já posso baixar a CCT?"));
  for (const file of ["../../apps/server/routes/cct.route.ts",
    "../../apps/server/services/cct-guest.ts", "../supabase/functions/sindratar-api/index.ts"]) {
    assert.ok(!read(file).includes("negotiationSnapshot"));
  }
  assert.equal((native.match(/class="cct-faq"/g) || []).length, 1);
  assert.equal((native.match(/<details><summary>/g) || []).length, 8);
  assert.equal((native.match(/<h1>/g) || []).length, 1);
  assert.ok(native.includes('faq.type="application/ld+json"'));
});
