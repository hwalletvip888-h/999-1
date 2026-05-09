/**
 * H Wallet 后端 HTTP 统一错误（供 onchain callBackend 与后续扩展使用）
 */
export class HwalletHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "HwalletHttpError";
  }
}
