/**
 * Admin API（/api/admin/*）单一事实来源：路径、方法、运维页说明、路由分发 key。
 * 新增 Admin 接口时：**只改本文件**，并同步 `routes/admin-routes.ts` 中 `dispatchAdminOp`。
 */

export type AdminOp =
  | "ping"
  | "overview"
  | "system"
  | "trendStatus"
  | "aiLimits"
  | "diagnostics"
  | "settingsGet"
  | "settingsPost";

export interface AdminApiRouteSpec {
  readonly path: string;
  readonly method: "GET" | "POST";
  /** 运维页 / README 用一句话说明 */
  readonly docNote: string;
  readonly op: AdminOp;
}

/** 与 `routes/admin-routes.ts` 中已处理路由一致；顺序仅影响文档展示，不影响匹配 */
export const ADMIN_API_ROUTE_SPECS: readonly AdminApiRouteSpec[] = [
  { path: "/api/admin/ping", method: "GET", docNote: "校验密钥", op: "ping" },
  { path: "/api/admin/overview", method: "GET", docNote: "健康、沙箱列表、脱敏配置", op: "overview" },
  { path: "/api/admin/system", method: "GET", docNote: "进程 uptime、Node 版本、内存", op: "system" },
  { path: "/api/admin/trend-status", method: "GET", docNote: "趋势磁盘报告摘要（无则 hasReport:false）", op: "trendStatus" },
  { path: "/api/admin/ai-limits", method: "GET", docNote: "AI 限流窗口与当前桶数量", op: "aiLimits" },
  { path: "/api/admin/diagnostics", method: "GET", docNote: "聚合只读诊断（进程、路由表、HTTP 常量等）", op: "diagnostics" },
  { path: "/api/admin/settings", method: "GET", docNote: "运行时参数快照", op: "settingsGet" },
  { path: "/api/admin/settings", method: "POST", docNote: "JSON 合并写入（字段见 ops-console/README）", op: "settingsPost" },
];

/** 查找当前请求对应的 op；未命中返回 null（由路由层返回 404） */
export function matchAdminRoute(url: string, method: string): AdminOp | null {
  const m = method.toUpperCase();
  if (m !== "GET" && m !== "POST") return null;
  const hit = ADMIN_API_ROUTE_SPECS.find((r) => r.path === url && r.method === m);
  return hit ? hit.op : null;
}

/** 供 `/ops` 注入：合并同 path 的 GET/POST 说明（与旧版 ADMIN_OPS_API_DOCS 展示一致） */
export function buildAdminOpsDocRows(): { path: string; note: string }[] {
  const order = [
    "/api/admin/ping",
    "/api/admin/overview",
    "/api/admin/system",
    "/api/admin/trend-status",
    "/api/admin/ai-limits",
    "/api/admin/diagnostics",
    "/api/admin/settings",
  ];
  const settings = ADMIN_API_ROUTE_SPECS.filter((r) => r.path === "/api/admin/settings");
  const rest = ADMIN_API_ROUTE_SPECS.filter((r) => r.path !== "/api/admin/settings");
  const rows = rest.map((r) => ({ path: r.path, note: r.docNote }));
  const g = settings.find((s) => s.method === "GET");
  const p = settings.find((s) => s.method === "POST");
  if (g && p) {
    rows.push({
      path: "/api/admin/settings",
      note: `GET：${g.docNote}；POST：${p.docNote}`,
    });
  }
  rows.sort((a, b) => order.indexOf(a.path) - order.indexOf(b.path));
  return rows;
}

/** 与 `buildAdminOpsDocRows()` 相同，供 `admin-ops` / `ops-console-html` 引用 */
export const ADMIN_OPS_API_DOCS: { path: string; note: string }[] = buildAdminOpsDocRows();
