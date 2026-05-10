import { describe, expect, it } from "vitest";
import { getOpsConsoleHtml } from "./ops-console-html";

describe("getOpsConsoleHtml", () => {
  it("injects admin routes and bootstrap", () => {
    const html = getOpsConsoleHtml();
    expect(html).toContain("/api/admin/ping");
    expect(html).toContain("ops-bootstrap");
    expect(html).not.toContain("<!--OPS_ADMIN_TBODY-->");
    expect(html).not.toContain("<!--OPS_PUBLIC_ROUTES_TBODY-->");
  });
});
