import { describe, expect, it } from "vitest";
import { buildBffHttpRouteCatalog, H1_CAPABILITY_REGISTRY } from "./h1-capabilities";

describe("buildBffHttpRouteCatalog", () => {
  it("includes fixed endpoints and every registry path plus aliases", () => {
    const cat = buildBffHttpRouteCatalog();
    const paths = new Set(cat.map((r) => `${r.method} ${r.path}`));
    expect(paths.has("GET /health")).toBe(true);
    expect(paths.has("GET /ops")).toBe(true);
    expect(paths.has("POST /api/ai/intent")).toBe(true);
    let expected = 5;
    for (const cap of H1_CAPABILITY_REGISTRY) {
      expected += 1 + (cap.pathAliases?.length ?? 0);
    }
    expect(cat.length).toBe(expected);
  });
});
