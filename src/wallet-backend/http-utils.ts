import * as http from "http";
import { getEffectiveMaxJsonBodyBytes } from "./runtime-settings";

/** 与 http-server 约定：非法 JSON 请求体须返回 400 */
export const INVALID_JSON_BODY = "INVALID_JSON_BODY";

export function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;

    req.on("data", (chunk: Buffer | string) => {
      if (aborted) return;
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += buf.length;
      if (total > getEffectiveMaxJsonBodyBytes()) {
        aborted = true;
        reject(new Error("PAYLOAD_TOO_LARGE"));
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        const body = Buffer.concat(chunks, total).toString("utf8");
        if (!body.trim()) {
          resolve({});
          return;
        }
        resolve(JSON.parse(body));
      } catch {
        reject(new Error(INVALID_JSON_BODY));
      }
    });
    req.on("error", reject);
  });
}
