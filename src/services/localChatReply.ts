import { normalizeUserUtterance } from "./ai-parse/normalizeUtterance";

const HELP =
  "📌 **怎么用 H**\n\n用一句话说出需求即可，例如：**充值**、**总资产**、**BTC 行情**、**转 50U 给 0x…**\n\n想完整看能力清单，可以说 **你是谁**。";

const HI = "👋 你好，我是 **H**，你的链上 AI 管家。直接说你想查或想办的事就行。";

const TY = "不客气，有需要随时叫我。";

const BYE = "再见，祝交易顺利 🐬";

const ACK = "好的，我在。需要查行情、资产、充值地址或转账，直接说就行。";

const PRIVACY =
  "🔒 对话里**不要粘贴私钥 / 助记词**。链上地址与操作说明可以发；敏感操作建议只在官方环境完成。";

const PRICING =
  "💬 与 **H** 对话本身不收费；**链上转账 / Swap** 等会按各链支付 Gas，由网络与路由决定。";

const HUMAN =
  "如需人工协助，请通过 **App 内官方渠道 / 工单**联系支持；我不会索要私钥或验证码。";

/**
 * 闲聊场景：本地固定回复，命中则**先于**远程对话模型返回（省延迟与 token）。
 */
export function tryLocalChatReply(rawInput: string): string | null {
  const t = normalizeUserUtterance(rawInput).toLowerCase();
  if (!t) return null;

  if (
    /^(帮助|怎么用|使用说明|新手引导|说明书|不会用|教我怎么用|怎么玩)[!.！。…~～]*$/u.test(t) ||
    (t.length <= 20 && /^(帮助|怎么用|新手)$/u.test(t))
  ) {
    return HELP;
  }

  if (
    /^(你好|您好|在吗|嗨|哈喽|早上好|中午好|下午好|晚上好|hi|hello|hey|在不在)[!.！。…~～]*$/u.test(t)
  ) {
    return HI;
  }

  if (/^(谢谢|感谢|多谢|辛苦了|麻烦了|thx|thanks)[!.！。…~～]*$/u.test(t)) {
    return TY;
  }

  if (/^(再见|拜拜|回见|bye|byebye|goodbye)[!.！。…~～]*$/u.test(t)) {
    return BYE;
  }

  if (/^(好的|好哒|好滴|明白|收到|懂了|ok|okay|行|可以)[!.！。…~～]*$/u.test(t)) {
    return ACK;
  }

  if (t.length <= 24 && /^(隐私|数据安全)/u.test(t)) {
    return PRIVACY;
  }

  if (t.length <= 36 && /(收费|订阅|多少钱|会员|付费|价格).*(吗|么|\?)?$/u.test(t)) {
    return PRICING;
  }

  if (t.length <= 28 && /(人工|客服|真人|投诉)/u.test(t)) {
    return HUMAN;
  }

  return null;
}
