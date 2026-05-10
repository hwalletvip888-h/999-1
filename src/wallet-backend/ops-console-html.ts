/**
 * 运维页 HTML：读取 `ops-console/index.html` 模板，注入与后端一致的路由表与元数据。
 * 单一事实来源：`admin-api-catalog` 中 `ADMIN_OPS_API_DOCS` + Admin GET 快捷列表、`admin-ops` 中 `HTTP_ROUTE_CATALOG`。
 */
import * as fs from "fs";
import * as nodePath from "path";
import { ADMIN_API_ROUTE_SPECS, ADMIN_OPS_API_DOCS } from "./admin-api-catalog";
import { HTTP_ROUTE_CATALOG } from "./admin-ops";
import { WALLET_PORT } from "./config";

/** 无需 X-Ops-Key、可在新标签直接打开的常用路径（与 `health-route` / `/ops` 一致） */
const OPS_PUBLIC_QUICK_LINKS: readonly { path: string; note: string }[] = [
  { path: "/health", note: "健康检查 JSON，无需密钥" },
  { path: "/ops", note: "本运维页（同源）" },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAdminTbody(): string {
  return ADMIN_OPS_API_DOCS.map(
    (r) => `<tr><td><code>${escapeHtml(r.path)}</code></td><td>${escapeHtml(r.note)}</td></tr>`,
  ).join("");
}

function renderPublicRoutesTbody(): string {
  return HTTP_ROUTE_CATALOG.map(
    (r) =>
      `<tr><td><code>${escapeHtml(r.method)}</code></td><td><code>${escapeHtml(r.path)}</code></td><td>${escapeHtml(
        r.note,
      )}</td></tr>`,
  ).join("");
}

function resolveTemplatePath(): string | null {
  const fromCwd = nodePath.join(process.cwd(), "ops-console", "index.html");
  if (fs.existsSync(fromCwd)) return fromCwd;
  // tsx / 编译后从 src/wallet-backend 上溯到仓库根
  const fromSrc = nodePath.join(__dirname, "..", "..", "ops-console", "index.html");
  if (fs.existsSync(fromSrc)) return fromSrc;
  return null;
}

function bootstrapJson(): string {
  const adminQuickGets = ADMIN_API_ROUTE_SPECS.filter((r) => r.method === "GET").map((r) => ({
    path: r.path,
    label: r.path.replace(/^\/api\/admin\//, ""),
    note: r.docNote,
  }));
  const payload = {
    generatedAt: new Date().toISOString(),
    walletPort: WALLET_PORT,
    adminApi: ADMIN_OPS_API_DOCS,
    httpRoutes: HTTP_ROUTE_CATALOG,
    adminQuickGets,
    publicQuickLinks: [...OPS_PUBLIC_QUICK_LINKS],
  };
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

function fallbackOpsHtml(): string {
  const port = WALLET_PORT;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><title>H Wallet 运维台</title></head>
<body style="font-family:system-ui;padding:1.5rem;max-width:42rem">
<h1>运维台模板未找到</h1>
<p>无法在磁盘上读取 <code>ops-console/index.html</code>。请从仓库根目录执行 <code>npm run dev:wallet-backend</code>，或确保部署镜像内包含该文件。</p>
<p>监听端口：<strong>${port}</strong></p>
</body></html>`;
}

/**
 * 生成完整 `/ops` HTML（含注入的路由表与 <code>ops-bootstrap</code> JSON）。
 */
export function getOpsConsoleHtml(): string {
  const tplPath = resolveTemplatePath();
  if (!tplPath) return fallbackOpsHtml();
  let html: string;
  try {
    html = fs.readFileSync(tplPath, "utf8");
  } catch {
    return fallbackOpsHtml();
  }

  const meta = `服务端生成 · ${new Date().toLocaleString("zh-CN", { hour12: false })} · 端口 ${WALLET_PORT}`;
  if (html.includes("<!--OPS_PAGE_META-->")) {
    html = html.replace("<!--OPS_PAGE_META-->", escapeHtml(meta));
  }

  html = html.replace("<!--OPS_ADMIN_TBODY-->", renderAdminTbody());
  html = html.replace("<!--OPS_PUBLIC_ROUTES_TBODY-->", renderPublicRoutesTbody());

  const boot = `<script type="application/json" id="ops-bootstrap">${bootstrapJson()}</script>`;
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${boot}\n</head>`);
  } else {
    html = `${boot}\n${html}`;
  }

  return html;
}
