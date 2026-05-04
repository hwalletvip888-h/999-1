/**
 * okx.example.ts —— 凭证模板（可提交）
 *
 * 用法：
 *   1) 复制本文件为 `okx.local.ts`（同目录）
 *   2) 把你在 OKX 后台生成的 API Key / Secret / Passphrase 填进去
 *   3) okx.local.ts 已被 .gitignore，不会进版本库
 *
 * ⚠️ 即使 key 勾了 Trade 权限，本项目当前只用于"读数据"。
 *    真实下单需要后续在 agentRunner.ts 里显式打开 enableRealOrders。
 */

import type { OkxCredentials } from "./okxTypes";

export const okxCredentials: OkxCredentials = {
  apiKey: "",
  apiSecret: "",
  passphrase: "",
  /** 是否走 OKX 模拟盘 (x-simulated-trading: 1) */
  simulated: false
};
