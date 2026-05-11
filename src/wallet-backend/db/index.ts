/**
 * JSON 文件数据库 — 零依赖，生产级 ACID（文件级别原子写）。
 *
 * 架构：
 *   db/
 *     wallets/        ← 每个钱包地址独立一个 JSON 文件
 *       {address}.json   { profile, conversations, cards, transactions }
 *     analytics/      ← 汇总分析数据
 *       events.json
 *
 * 所有写操作使用原子写（write + fsync + rename），崩溃不丢数据。
 */
import * as fs from "fs";
import * as os from "os";
import * as nodePath from "path";
import { ensureCliHomeRoot } from "../cli-home";
import { CLI_HOME_ROOT } from "../config";

/** 数据库根目录；优先 CLI_HOME_ROOT，不可写则回退到系统临时目录 */
function dbRoot(): string {
  const preferred = nodePath.join(CLI_HOME_ROOT, "db");
  try {
    fs.mkdirSync(preferred, { recursive: true, mode: 0o700 });
    return preferred;
  } catch {
    const fallback = nodePath.join(os.tmpdir(), "hwallet-db");
    fs.mkdirSync(fallback, { recursive: true, mode: 0o700 });
    console.warn(`[DB] CLI_HOME_ROOT 不可写，数据库回退到: ${fallback}`);
    return fallback;
  }
}

// ─── 类型定义 ────────────────────────────────────────────────


export type WalletProfile = {
  address: string;
  nickname?: string;
  avatar?: string;
  firstSeenAt: string;
  lastActiveAt: string;
  totalConversations: number;
  totalCards: number;
  totalTxs: number;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  intent?: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  cardIds?: string[];
};

export type CardRecord = {
  id: string;
  actionType: string;
  symbol?: string;
  amount?: number;
  cardData: any;
  createdAt: string;
  conversationId?: string;
};

export type TransactionRecord = {
  id: string;
  chain: string;
  txHash?: string;
  action: string;
  symbol: string;
  amount: number;
  status: "pending" | "confirmed" | "failed";
  fee?: string;
  errorMsg?: string;
  createdAt: string;
  completedAt?: string;
  conversationId?: string;
};

export type AnalyticsEvent = {
  id: string;
  walletAddress?: string;
  eventType: string;
  payload: Record<string, any>;
  createdAt: string;
};

export type WalletData = {
  profile: WalletProfile;
  conversations: Conversation[];
  cards: CardRecord[];
  transactions: TransactionRecord[];
};

// ─── 路径工具 ────────────────────────────────────────────────

function walletDir(): string {
  const dir = nodePath.join(dbRoot(), "wallets");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function walletPath(address: string): string {
  return nodePath.join(walletDir(), `${address.toLowerCase()}.json`);
}

function analyticsDir(): string {
  const dir = nodePath.join(dbRoot(), "analytics");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function eventsPath(): string {
  return nodePath.join(analyticsDir(), "events.json");
}

// ─── 原子写入（崩溃安全） ────────────────────────────────────

function atomicWrite(filePath: string, data: unknown): void {
  const tmp = filePath + ".tmp." + process.pid;
  const json = JSON.stringify(data, null, 2) + "\n";
  fs.writeFileSync(tmp, json, { encoding: "utf8", mode: 0o600 });
  fs.fsyncSync(fs.openSync(tmp, "r"));
  fs.renameSync(tmp, filePath);
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ─── 数据库 CRUD ─────────────────────────────────────────────

const walletCache = new Map<string, WalletData>();

function loadWallet(address: string): WalletData {
  const key = address.toLowerCase();
  const cached = walletCache.get(key);
  if (cached) return cached;
  const data = safeReadJson<WalletData | null>(walletPath(key), null);
  if (data) {
    walletCache.set(key, data);
    return data;
  }
  // 创建新钱包
  const now = new Date().toISOString();
  const fresh: WalletData = {
    profile: {
      address: key,
      firstSeenAt: now,
      lastActiveAt: now,
      totalConversations: 0,
      totalCards: 0,
      totalTxs: 0,
    },
    conversations: [],
    cards: [],
    transactions: [],
  };
  walletCache.set(key, fresh);
  return fresh;
}

function saveWalletSync(address: string): void {
  const key = address.toLowerCase();
  const data = walletCache.get(key);
  if (!data) return;
  atomicWrite(walletPath(key), data);
}

// ─── 公开 API ────────────────────────────────────────────────

export const walletDb = {
  /** 获取或创建钱包档案 */
  getOrCreate(address: string): WalletData {
    return loadWallet(address);
  },

  /** 保存用户档案信息 */
  updateProfile(address: string, patch: Partial<WalletProfile>): void {
    const data = loadWallet(address);
    Object.assign(data.profile, patch, { lastActiveAt: new Date().toISOString() });
    saveWalletSync(address);
  },

  /** 添加一条对话记录 */
  addConversation(address: string, conv: Conversation): void {
    const data = loadWallet(address);
    data.conversations.push(conv);
    data.profile.totalConversations = data.conversations.length;
    data.profile.lastActiveAt = new Date().toISOString();
    saveWalletSync(address);
  },

  /** 追加消息到已有对话 */
  appendMessage(address: string, conversationId: string, msg: ConversationMessage): void {
    const data = loadWallet(address);
    const conv = data.conversations.find((c) => c.id === conversationId);
    if (conv) {
      conv.messages.push(msg);
      conv.updatedAt = new Date().toISOString();
      saveWalletSync(address);
    }
  },

  /** 获取用户的对话列表（按时间倒序） */
  getConversations(address: string, limit = 50): Conversation[] {
    const data = loadWallet(address);
    return [...data.conversations].reverse().slice(0, limit);
  },

  /** 添加一张卡片记录 */
  addCard(address: string, card: CardRecord): void {
    const data = loadWallet(address);
    data.cards.push(card);
    data.profile.totalCards = data.cards.length;
    data.profile.lastActiveAt = new Date().toISOString();
    saveWalletSync(address);
  },

  /** 获取用户的历史卡片 */
  getCards(address: string, limit = 50): CardRecord[] {
    const data = loadWallet(address);
    return [...data.cards].reverse().slice(0, limit);
  },

  /** 添加交易记录 */
  addTransaction(address: string, tx: TransactionRecord): void {
    const data = loadWallet(address);
    data.transactions.push(tx);
    data.profile.totalTxs = data.transactions.length;
    data.profile.lastActiveAt = new Date().toISOString();
    saveWalletSync(address);
  },

  /** 更新交易状态 */
  updateTransaction(address: string, txId: string, patch: Partial<TransactionRecord>): void {
    const data = loadWallet(address);
    const tx = data.transactions.find((t) => t.id === txId);
    if (tx) {
      Object.assign(tx, patch);
      saveWalletSync(address);
    }
  },

  /** 获取用户的交易历史 */
  getTransactions(address: string, limit = 50): TransactionRecord[] {
    const data = loadWallet(address);
    return [...data.transactions].reverse().slice(0, limit);
  },

  /** 记录分析事件（匿名也可） */
  addEvent(event: AnalyticsEvent): void {
    const path = eventsPath();
    const events = safeReadJson<AnalyticsEvent[]>(path, []);
    events.push(event);
    // 保持最近 10000 条，防止文件过大
    if (events.length > 10000) events.splice(0, events.length - 10000);
    atomicWrite(path, events);
  },

  /** 获取分析事件（按类型筛选） */
  getEvents(eventType?: string, limit = 200): AnalyticsEvent[] {
    const path = eventsPath();
    const events = safeReadJson<AnalyticsEvent[]>(path, []);
    const filtered = eventType ? events.filter((e) => e.eventType === eventType) : events;
    return filtered.reverse().slice(0, limit);
  },

  /** 强制刷新缓存到磁盘 */
  flush(address?: string): void {
    if (address) {
      saveWalletSync(address);
    } else {
      for (const key of walletCache.keys()) {
        saveWalletSync(key);
      }
    }
  },
};
