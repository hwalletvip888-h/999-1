import { describe, expect, it } from "vitest";
import { ADMIN_API_ROUTE_SPECS, buildAdminOpsDocRows, matchAdminRoute } from "./admin-api-catalog";

describe("admin-api-catalog", () => {
  it("matches every declared route", () => {
    for (const r of ADMIN_API_ROUTE_SPECS) {
      expect(matchAdminRoute(r.path, r.method)).toBe(r.op);
    }
  });

  it("returns null for unknown admin path", () => {
    expect(matchAdminRoute("/api/admin/nope", "GET")).toBeNull();
  });

  it("buildAdminOpsDocRows merges settings GET/POST", () => {
    const rows = buildAdminOpsDocRows();
    const settings = rows.find((x) => x.path === "/api/admin/settings");
    expect(settings).toBeDefined();
    expect(settings!.note).toContain("GET：");
    expect(settings!.note).toContain("POST：");
  });
});
