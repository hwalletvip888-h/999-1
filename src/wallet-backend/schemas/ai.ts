import { z } from "zod";

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().max(500_000),
});

export const aiChatBodySchema = z.object({
  messages: z.array(chatMessageSchema).max(50).optional(),
  message: z.string().min(1).max(100_000),
});

export const aiIntentBodySchema = z.object({
  message: z.string().min(1).max(50_000),
});

export function zodIssuesSummary(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.length ? i.path.join(".") : "body"}: ${i.message}`)
    .slice(0, 6)
    .join("; ");
}

export function parseAiChatBody(
  raw: unknown,
): { ok: true; data: z.infer<typeof aiChatBodySchema> } | { ok: false; error: string } {
  const r = aiChatBodySchema.safeParse(raw);
  if (!r.success) return { ok: false, error: zodIssuesSummary(r.error) };
  return { ok: true, data: r.data };
}

export function parseAiIntentBody(
  raw: unknown,
): { ok: true; data: z.infer<typeof aiIntentBodySchema> } | { ok: false; error: string } {
  const r = aiIntentBodySchema.safeParse(raw);
  if (!r.success) return { ok: false, error: zodIssuesSummary(r.error) };
  return { ok: true, data: r.data };
}
