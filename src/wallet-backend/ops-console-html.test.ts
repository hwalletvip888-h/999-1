import { describe, expect, it } from "vitest";
import { getOpsConsoleHtml } from "./ops-console-html";

describe("getOpsConsoleHtml", () => {
  it("injects admin routes and bootstrap", () => {
    const html = getOpsConsoleHtml();
    expect(html).toContain("/api/admin/ping");
    expect(html).toContain("ops-bootstrap");
    expect(html).not.toContain("<!--OPS_ADMIN_TBODY-->");
    expect(html).not.toContain("<!--OPS_PUBLIC_ROUTES_TBODY-->");
    const m = html.match(/id="ops-bootstrap"[^>]*>([\s\S]*?)<\/script>/);
    expect(m).toBeTruthy();
    const boot = JSON.parse(m![1]) as {
      adminQuickGets: { path: string; label: string }[];
      publicQuickLinks: { path: string }[];
    };
    expect(boot.adminQuickGets.map((x) => x.path)).toContain("/api/admin/ping");
    expect(boot.adminQuickGets.length).toBeGreaterThanOrEqual(7);
    expect(boot.publicQuickLinks.map((x) => x.path)).toEqual(["/health", "/ops"]);
  });
});
