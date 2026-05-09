import * as crypto from "crypto";
import * as http from "http";
import { META_CAPABILITIES_TOKEN } from "./config";

export function assertMetaCapabilitiesAuthorized(req: http.IncomingMessage): boolean {
  if (!META_CAPABILITIES_TOKEN) {
    return true;
  }
  const got = (req.headers["x-hwallet-meta-token"] as string | undefined)?.trim() || "";
  const exp = META_CAPABILITIES_TOKEN;
  if (got.length !== exp.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(exp, "utf8"));
  } catch {
    return false;
  }
}
