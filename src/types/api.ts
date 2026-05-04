// 统一 API 响应类型
export type ApiResponse<T = any> = {
  ok: boolean;
  data?: T;
  errorCode?: string;
  errorMsg?: string;
  simulationMode?: boolean;
};
