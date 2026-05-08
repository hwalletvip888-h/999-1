// 启动引导: 把 5 类 MVP H Skill 的 impl 函数注册到 registry.
//
// 调用时机: App / 后端启动初始化时调一次.
// import 顺序无所谓, 但必须在 SkillRegistry.dispatch 之前.

import { stableYield } from "./h-v2/strategy/stable-yield/index";
import { dca } from "./h-v2/strategy/dca/index";
import { dipBuy } from "./h-v2/strategy/dip-buy/index";
import { takeProfit } from "./h-v2/strategy/take-profit/index";
import { copySignal } from "./h-v2/strategy/copy-signal/index";
import { getSkillRegistry } from "./registry";

/** 初始化 H Skill registry, 注册全部 MVP impl. 启动时调一次. */
export function bootstrapSkills(): void {
  const reg = getSkillRegistry();
  reg.registerImpl("h.v2.strategy.stable_yield", stableYield);
  reg.registerImpl("h.v2.strategy.dca", dca);
  reg.registerImpl("h.v2.strategy.dip_buy", dipBuy);
  reg.registerImpl("h.v2.strategy.take_profit", takeProfit);
  reg.registerImpl("h.v2.strategy.copy_signal", copySignal);
}
