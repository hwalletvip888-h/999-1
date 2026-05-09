import type { TraceId } from "../types/h1-errors.js";

/** 划转入参（接入层不关心对话，只关心结构化参数）。 */
export interface SubmitTransferInput {
  traceId: TraceId;
  amountUsd: number;
  /** 已解析的目标：绑定 OKX 地址或显式地址 */
  toAddress: string;
  memo?: string;
}

export interface SubmitTransferOutput {
  orderId: string;
  txHash: string;
}

/**
 * H1.integration.okx — 唯一出口封装 OnchainOS / Agent Wallet（此处为接口 + Mock）。
 */
export interface H1IntegrationOkx {
  submitTransfer(input: SubmitTransferInput): Promise<SubmitTransferOutput>;
}

/** 测试与本地演示用：成功返回固定 hash。 */
export class MockH1IntegrationOkx implements H1IntegrationOkx {
  async submitTransfer(input: SubmitTransferInput): Promise<SubmitTransferOutput> {
    return {
      orderId: `ord_${input.traceId.slice(0, 8)}`,
      txHash: `0xmock_${input.traceId.replace(/-/g, "").slice(0, 16)}`,
    };
  }
}

/** 可注入失败，用于编排层错误路径测试 */
export class FlakyMockH1IntegrationOkx implements H1IntegrationOkx {
  constructor(private readonly failOnce: boolean) {}
  private tried = false;

  async submitTransfer(input: SubmitTransferInput): Promise<SubmitTransferOutput> {
    if (this.failOnce && !this.tried) {
      this.tried = true;
      throw Object.assign(new Error("timeout"), {
        code: "H1.OKX.TIMEOUT",
        userMessageKey: "transfer.network_timeout",
      });
    }
    return new MockH1IntegrationOkx().submitTransfer(input);
  }
}
