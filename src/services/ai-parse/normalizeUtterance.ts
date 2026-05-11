/** 用户输入归一化：去首尾空白、折叠空白，不改变大小写（意图层自行处理） */
export function normalizeUserUtterance(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}
