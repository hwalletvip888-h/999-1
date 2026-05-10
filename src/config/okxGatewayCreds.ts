/**
 * V5 网关 / Provider 使用的 OKX 凭证（okxClient 形状：apiKey + secretKey + passphrase）。
 *
 * 优先级：
 *  1) `okx.local.ts` 中 `OKX_CONFIG` 或 `okxCredentials`（支持 `secretKey` 或 `apiSecret`）
 *  2) `loadOkxCredentials()`（与 `okx.ts` 内置 / 可提交配置一致）
 *  3) 空字符串占位（与旧 gateway 行为一致，私有接口不可用但不抛）
 */
import type { OkxCredentials } from "../api/providers/okx/okxClient";
import { loadOkxCredentials } from "./okx";

function emptyCreds(): OkxCredentials {
  return { apiKey: "", secretKey: "", passphrase: "" };
}

export function isOkxGatewayConfigured(c: OkxCredentials): boolean {
  return !!(c.apiKey?.trim() && c.secretKey?.trim() && c.passphrase?.trim());
}

export function getOkxGatewayCredentials(): OkxCredentials {
  try {
    const local = require("./okx.local") as Record<string, unknown>;
    const cfg = (local?.OKX_CONFIG ?? local?.okxCredentials) as Record<string, unknown> | undefined;
    if (cfg && typeof cfg === "object") {
      const apiKey = String(cfg.apiKey ?? "").trim();
      const secretKey = String(cfg.secretKey ?? cfg.apiSecret ?? "").trim();
      const passphrase = String(cfg.passphrase ?? "").trim();
      const simulated = Boolean(cfg.simulated);
      if (apiKey && secretKey && passphrase) {
        return { apiKey, secretKey, passphrase, simulated };
      }
    }
  } catch {
    // okx.local 不存在或格式异常 → 走下方回退
  }

  const app = loadOkxCredentials();
  if (app) {
    return {
      apiKey: app.apiKey,
      secretKey: app.apiSecret,
      passphrase: app.passphrase,
      simulated: app.simulated,
    };
  }

  return emptyCreds();
}
