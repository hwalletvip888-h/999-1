import * as http from "http";
import { parseBody } from "../http-utils";
import { parseAuthSendOtpBody, parseAuthVerifyOtpBody } from "../schemas/auth";
import { handleSendOtpViaProvider, handleVerifyOtpViaProvider } from "../wallet-cli-handlers";

export async function tryAuthRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
): Promise<boolean> {
  const isSendOtp =
    (url === "/api/auth/send-otp" || url === "/api/agent-wallet/send-code") && method === "POST";
  const isVerifyOtp =
    (url === "/api/auth/verify-otp" || url === "/api/agent-wallet/verify") && method === "POST";

  if (isSendOtp) {
    const raw = await parseBody(req);
    const parsed = parseAuthSendOtpBody(raw);
    if (!parsed.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: parsed.error }));
      return true;
    }
    const result = await handleSendOtpViaProvider(parsed.data.email);
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return true;
  }
  if (isVerifyOtp) {
    const raw = await parseBody(req);
    const parsed = parseAuthVerifyOtpBody(raw);
    if (!parsed.ok) {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: parsed.error }));
      return true;
    }
    const result = await handleVerifyOtpViaProvider(parsed.data.email, parsed.data.code);
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return true;
  }
  return false;
}
