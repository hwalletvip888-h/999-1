/**
 * OnchainOS CLI 封装：版本探测 + JSON 输出解析
 */
import { execFileSync } from "child_process";

let _onchainosCliAvailable: boolean | null = null;

export function isOnchainosCliAvailable(): boolean {
  if (_onchainosCliAvailable !== null) return _onchainosCliAvailable;
  try {
    execFileSync("onchainos", ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
    });
    _onchainosCliAvailable = true;
  } catch {
    _onchainosCliAvailable = false;
  }
  return _onchainosCliAvailable;
}

/**
 * 调用 onchainos CLI 并解析 stdout JSON。
 * @param home 传入时设置 ONCHAINOS_HOME（用户沙箱）
 */
export function runOnchainosJson(args: string[], home?: string, timeoutMs = 60_000): any {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (home) env.ONCHAINOS_HOME = home;
  let stdout = "";
  let stderr = "";
  try {
    stdout = execFileSync("onchainos", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      env,
    });
  } catch (err: any) {
    stdout = err?.stdout?.toString() || "";
    stderr = err?.stderr?.toString() || "";
  }
  const trimmed = String(stdout || "").trim();
  const first = trimmed.indexOf("{");
  const jsonStr = first >= 0 ? trimmed.slice(first) : trimmed;
  if (!jsonStr) {
    throw new Error(stderr.trim() || "onchainos CLI 无输出");
  }
  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error(stderr.trim() || trimmed || "onchainos CLI 输出解析失败");
  }
}
