import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = resolve(import.meta.dirname, "../../..");
const demoPath = resolve(root, "apps/client/src/pages/home/components/Demo.tsx");
const originalDemo = readFileSync(demoPath, "utf8");

function createDemoSource(definitions, node) {
  return `import * as React from "react";

${definitions}

export const Demo = () => {
  return (
    <div>
      <p>Demo before</p>
      ${node}
      <p>Demo after</p>
    </div>
  );
};
`;
}

const scenarios = [
  {
    name: "normal",
    source: `export const Demo = () => {
  return <div>Hello World</div>;
};
`,
    expectedPresent: ["Hello World"],
    expectedAbsent: ["Demo before", "Demo after", "failure"],
    expectPrerender: true,
  },
  {
    name: "function-declaration",
    source: createDemoSource(
      `function BrokenFunction() {
  throw new Error("function failure");
}`,
      "<BrokenFunction />"
    ),
    expectedPresent: ["Demo before", "Demo after", "Start building your amazing project here!"],
    expectedAbsent: ["function failure"],
    expectPrerender: true,
  },
  {
    name: "arrow-block",
    source: createDemoSource(
      `const BrokenArrowBlock = () => {
  throw new Error("arrow block failure");
};`,
      "<BrokenArrowBlock />"
    ),
    expectedPresent: ["Demo before", "Demo after"],
    expectedAbsent: ["arrow block failure"],
    expectPrerender: true,
  },
  {
    name: "arrow-expression",
    source: createDemoSource(
      `function failExpression(): never {
  throw new Error("arrow expression failure");
}
const BrokenArrowExpression = () => failExpression();`,
      "<BrokenArrowExpression />"
    ),
    expectedPresent: ["Demo before", "Demo after"],
    expectedAbsent: ["arrow expression failure"],
    expectPrerender: true,
  },
  {
    name: "class-render",
    source: createDemoSource(
      `class BrokenClass extends React.Component {
  render() {
    throw new Error("class failure");
  }
}`,
      "<BrokenClass />"
    ),
    expectedPresent: ["Demo before", "Demo after"],
    expectedAbsent: ["class failure"],
    expectPrerender: true,
  },
  {
    name: "memo-named-inline",
    source: createDemoSource(
      `const BrokenMemoNamed = React.memo(function BrokenMemoNamedInner() {
  throw new Error("memo named failure");
});`,
      "<BrokenMemoNamed />"
    ),
    expectedPresent: ["Demo before", "Demo after"],
    expectedAbsent: ["memo named failure"],
    expectPrerender: true,
  },
  {
    name: "memo-anonymous-inline",
    source: createDemoSource(
      `const BrokenMemoAnonymous = React.memo(() => {
  throw new Error("memo anonymous failure");
});`,
      "<BrokenMemoAnonymous />"
    ),
    expectedPresent: ["Demo before", "Demo after"],
    expectedAbsent: ["memo anonymous failure"],
    expectPrerender: true,
  },
  {
    name: "forward-ref-named-inline",
    source: createDemoSource(
      `const BrokenForwardNamed = React.forwardRef<HTMLDivElement>(function BrokenForwardNamedInner(_props, ref) {
  if (ref !== undefined) {
    throw new Error("forward named failure");
  }
  return null;
});`,
      "<BrokenForwardNamed />"
    ),
    expectedPresent: ["Demo before", "Demo after"],
    expectedAbsent: ["forward named failure"],
    expectPrerender: true,
  },
  {
    name: "forward-ref-anonymous-inline",
    source: createDemoSource(
      `const BrokenForwardAnonymous = React.forwardRef<HTMLDivElement>(() => {
  throw new Error("forward anonymous failure");
});`,
      "<BrokenForwardAnonymous />"
    ),
    expectedPresent: ["Demo before", "Demo after"],
    expectedAbsent: ["forward anonymous failure"],
    expectPrerender: true,
  },
  {
    name: "memo-identifier",
    source: createDemoSource(
      `function BrokenMemoIdentifierInner() {
  throw new Error("memo identifier failure");
}
const BrokenMemoIdentifier = React.memo(BrokenMemoIdentifierInner);`,
      "<BrokenMemoIdentifier />"
    ),
    expectedPresent: ["Demo before", "Demo after"],
    expectedAbsent: ["memo identifier failure"],
    expectPrerender: true,
  },
  {
    name: "list-child",
    source: createDemoSource(
      `function BrokenListItem({ value }: { value: number }) {
  if (value === 2) throw new Error("list child failure");
  return <span>List item {value}</span>;
}`,
      "{[1, 2, 3].map((value) => <BrokenListItem key={value} value={value} />)}"
    ),
    expectedPresent: ["Demo before", "Demo after", "List item", "1", "3"],
    expectedAbsent: ["list child failure"],
    expectPrerender: true,
  },
  {
    name: "two-failures",
    source: createDemoSource(
      `function BrokenOne() {
  throw new Error("failure one");
}
function BrokenTwo() {
  throw new Error("failure two");
}`,
      "<><BrokenOne /><BrokenTwo /></>"
    ),
    expectedPresent: ["Demo before", "Demo after"],
    expectedAbsent: ["failure one", "failure two"],
    expectPrerender: true,
  },
  {
    name: "import-time-failure",
    source: `throw new Error("import time failure");

export const Demo = () => {
  return <div>unreachable import case</div>;
};
`,
    expectedPresent: [],
    expectedAbsent: ["unreachable import case"],
    expectPrerender: false,
  },
];

function runBuild() {
  rmSync(resolve(root, "apps/client/dist"), { recursive: true, force: true });
  rmSync(resolve(root, "apps/client/dist-ssr"), { recursive: true, force: true });

  return spawnSync("pnpm", ["--filter", "client", "build"], {
    cwd: root,
    encoding: "utf8",
    timeout: 90_000,
  });
}

const results = [];

try {
  for (const scenario of scenarios) {
    writeFileSync(demoPath, scenario.source);
    await sleep(25);

    const run = runBuild();
    const log = `${run.stdout}\n${run.stderr}`;
    const htmlPath = resolve(root, "apps/client/dist/index.html");
    const html = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "";
    const prerendered = log.includes("[prerender] home page baked into dist/index.html");
    const skipped = log.includes("[prerender] skipped:");
    const distSsrCleaned = !existsSync(resolve(root, "apps/client/dist-ssr"));
    const present = scenario.expectedPresent.map((text) => [text, html.includes(text)]);
    const absent = scenario.expectedAbsent.map((text) => [text, !html.includes(text)]);

    results.push({
      name: scenario.name,
      exit: run.status,
      prerendered,
      skipped,
      distSsrCleaned,
      present: Object.fromEntries(present),
      absent: Object.fromEntries(absent),
      pass:
        run.status === 0 &&
        distSsrCleaned &&
        (scenario.expectPrerender ? prerendered && !skipped : skipped) &&
        present.every(([, ok]) => ok) &&
        absent.every(([, ok]) => ok),
    });
  }
} finally {
  writeFileSync(demoPath, originalDemo);
  rmSync(resolve(root, "apps/client/dist-ssr"), { recursive: true, force: true });
}

console.log(JSON.stringify(results, null, 2));

if (results.some((result) => !result.pass)) {
  process.exit(1);
}
