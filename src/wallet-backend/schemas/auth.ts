import { z } from "zod";
import { zodIssuesSummary } from "./ai";

export const authSendOtpBodySchema = z.object({
  email: z.string().email().max(320),
});

export const authVerifyOtpBodySchema = z.object({
  email: z.string().email().max(320),
  code: z.string().regex(/^\d{6}$/),
});

export function parseAuthSendOtpBody(
  raw: unknown,
): { ok: true; data: z.infer<typeof authSendOtpBodySchema> } | { ok: false; error: string } {
  const r = authSendOtpBodySchema.safeParse(raw);
  if (!r.success) return { ok: false, error: zodIssuesSummary(r.error) };
  return { ok: true, data: r.data };
}

export function parseAuthVerifyOtpBody(
  raw: unknown,
): { ok: true; data: z.infer<typeof authVerifyOtpBodySchema> } | { ok: false; error: string } {
  const r = authVerifyOtpBodySchema.safeParse(raw);
  if (!r.success) return { ok: false, error: zodIssuesSummary(r.error) };
  return { ok: true, data: r.data };
}
