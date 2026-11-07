import assert from "node:assert/strict";
import { collectSitemapRoutesFromSource } from "./generate-sitemap-routes.mjs";

const source = `
  import { Routes, Route } from "react-router-dom";

  export function App() {
    return (
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path={"pricing"} element={<Pricing />} />
        <Route path="/blog/:slug" element={<Post />} />
        <Route path="/api/todos" element={<Api />} />
        <Route path="/assets/app.js" element={<Asset />} />
        <Route path="/publish/websiteBadge.js" element={<Publish />} />
        <Route path="/.well-known/acme-challenge/x" element={<WellKnown />} />
        <Route path="/robots.txt" element={<Robots />} />
        <Route path="/sitemap.xml" element={<Sitemap />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }
`;

assert.deepEqual(collectSitemapRoutesFromSource(source), ["/", "/about", "/pricing"]);

console.log("[sitemap-routes:test] ok");
