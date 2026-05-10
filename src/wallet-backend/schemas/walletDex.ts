import { z } from "zod";
import { zodIssuesSummary } from "./ai";

export const dexSwapBodySchema = z.object({
  fromChain: z.string().min(1).max(32),
  fromSymbol: z.string().min(1).max(32),
  fromAmount: z.string().min(1).max(64),
  toChain: z.string().min(1).max(32),
  toSymbol: z.string().min(1).max(32),
  slippageBps: z.number().finite().int().min(1).max(50_000).optional(),
  builderCode: z.string().max(128).optional(),
});

export const walletSendBodySchema = z.object({
  chain: z.string().min(1).max(32),
  symbol: z.string().min(1).max(32),
  toAddress: z.string().min(1).max(256),
  amount: z.string().min(1).max(64),
  tokenAddress: z.string().max(256).optional(),
});

export const switchAccountBodySchema = z.object({
  accountId: z.string().min(1).max(128),
});

export function parseDexSwapBody(
  raw: unknown,
): { ok: true; data: z.infer<typeof dexSwapBodySchema> } | { ok: false; error: string } {
  const r = dexSwapBodySchema.safeParse(raw);
  if (!r.success) return { ok: false, error: zodIssuesSummary(r.error) };
  return { ok: true, data: r.data };
}

export function parseWalletSendBody(
  raw: unknown,
): { ok: true; data: z.infer<typeof walletSendBodySchema> } | { ok: false; error: string } {
  const r = walletSendBodySchema.safeParse(raw);
  if (!r.success) return { ok: false, error: zodIssuesSummary(r.error) };
  return { ok: true, data: r.data };
}

export function parseSwitchAccountBody(
  raw: unknown,
): { ok: true; data: z.infer<typeof switchAccountBodySchema> } | { ok: false; error: string } {
  const r = switchAccountBodySchema.safeParse(raw);
  if (!r.success) return { ok: false, error: zodIssuesSummary(r.error) };
  return { ok: true, data: r.data };
}
