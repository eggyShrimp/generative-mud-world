---
name: llm-interactions
description: >
  LLM 交互筛选框架、14 种交互模式、触发→调度→持久化全链路、Tool Calling vs JSON 解析。
  Use for: LLM integration, interaction schemas, tool calling, dispatch pipeline.
---

# 03 — LLM ↔ Simulation 交互接口定义

## 决策框架：什么时候用 LLM，什么时候用规则？

核心问题不是"LLM 能做什么"，而是**规则做不了、做不好、或做起来太贵（人力成本）的事情，才值得调 LLM**。

### 三条筛选原则

| 原则 | 含义 | 反例（不调 LLM） |
|------|------|-----------------|
| **必要性** | 规则无法编码，或编码成本超过 LLM 调用成本 | 每日天气 → 规则随机；NPC 基本移动 → schedule |
| **稀缺性** | 输出需要每次不同，且有信息密度 | NPC 说"你好" → 模板；固定岗位工作 → 模板化描述 |
| **边界性** | 输出能被结构化消费，影响可控 | 纯 flavor text → simulation 无法消费，浪费 token |

### 排除清单

| 被排除的交互 | 排除原因 |
|-------------|----------|
| LLM 决定 NPC 每 tick 做什么 | schedule + need + trait weight 已足够；无法规模化 |
| LLM 生成 NPC 内心独白 | 纯 flavor text，simulation 无法消费 |
| LLM 实时评估每个 NPC 的情绪 | 情绪可从 need fulfillment 规则推导 |
| LLM 生成物品交易价格 | 供需规则模型更准确 |
| LLM 决定战斗结果 | 战斗系统应有独立规则 |
| LLM 生成每个 NPC 的每日计划 | 背景 NPC 用 schedule 模板即可 |
| LLM 做经济系统平衡 | LLM 不懂数值平衡 |
| LLM 控制天气/季节 | 随机+季节表即可 |
| LLM 生成背景 NPC 的日常闲聊 | 核心 NPC 间对话才需要 LLM |

---

## 统一流程

```
Simulation 检测触发条件 → 打包当前状态 → LLM 处理 → 解析结构化输出 → 注入 Simulation
```

所有 LLM 产出遵循统一格式（`SimulationDelta`），通过 `applyDelta` 写入世界状态。

---

## 完整交互清单（14 项设计 + 实现状态）

> 实现状态标签： 已完成 / 大部分完成 / 部分实现 / 已配置未激活 / 零代码

### 一次性

| # | 交互 | 产出 | 实现状态 | 实现位置 |
|---|------|------|---------|---------|
| 1 | 世界初始化 | WorldState | 已完成 | `llm/world-generator.ts:91` — CLI 工具，非运行时触发 |

### 每游戏月

| # | 交互 | 触发条件 | 产出 | 实现状态 | 说明 |
|---|------|----------|------|---------|------|
| 2 | 宏观叙事方向 | 每月审视全局 | 新时代主题 + 事件权重偏转 | 已配置未激活 | `llmTriggerConfig.narrativeDirection.enabled: false`；dispatcher 无触发代码 |
| 3 | 文化演化 | 行为扩散超阈值 | 新习俗/俚语/节日标签 | 已配置未激活 | `culturalEvolution.enabled: false`；dispatcher 无触发代码 |
| 4 | 发现/发明生成 | 领域活动积累超阈值 | 新技术/咒语/配方 | 已配置未激活 | `discoveryGeneration.enabled: false`；dispatcher 无触发代码 |
| 14 | 组织形式演化 | 治理问题积累 | 候选方案 → 权力结构投票 | 零代码 | 设计完备 (`04-auto-research.md`)，无代码落地 |

### 每游戏日

| # | 交互 | 触发条件 | 产出 | 实现状态 | 实现位置 |
|---|------|----------|------|---------|---------|
| 5 | 世界事件注入 | 定时 + 关键指标阈值 | 世界事件 + 影响范围 + 数值 delta | 已完成 | `llm/dispatcher.ts:56-79` 触发检测 → `:290-301` dispatch → `prompts/world-event.ts` |
| 6 | NPC 记忆压缩 | 观察积累超阈值 | 人格认知 + trait 偏移 | 已完成 | `llm/dispatcher.ts:82-103` 触发检测 → `:312-323` dispatch → `prompts/memory-compression.ts` |

### 按需

| # | 交互 | 触发条件 | 产出 | 实现状态 | 实现位置 |
|---|------|----------|------|---------|---------|
| 7 | 对话生成 | 玩家与 NPC 交谈 | 自然语言回复 + 关系/需求 delta | 已完成 | `llm/dialogue-generator.ts` — 选项生成(`:67`)+回复生成(`:100`)+tool_calls 处理(`:305`) |
| 8 | 谣言变形 | 信息跨区域传播 | 歪曲后的传言 + 情绪倾向 | 零代码 | `dialogueEffectMapping.information.spreadChance` 已读取并写入 event，但无消费端 |
| 9 | 涟漪评估 | 重大行动发生 | 受影响 NPC 列表 + 各自反应 | 零代码 | `social-ripple.ts` 是规则引擎实现（不调 LLM），LLM 版本未实现 |
| 10 | 死亡/退出涟漪 | 重要 NPC 死亡 | 权力真空 + 社会冲击波 | 零代码 | 无代码 |
| 11 | 派系行为生成 | NPC 共享利益达临界数量 | 集体人格 + 行动策略 | 零代码 | Faction 可被 materialize，但 LLM 不生成派系行为 |
| 12 | 冲突仲裁 | 两个 NPC 行为冲突 | 裁决结果 + 叙事化 | 零代码 | 无代码 |
| 13 | 重要对峙叙事化 | 高张力关系跌破阈值 | 叙事场景 + 状态变化 | 零代码 | 无代码 |

---

## 已运行但不在 14 项设计清单中的交互

| 交互 | 触发方式 | 实现 | 说明 |
|------|---------|------|------|
| **ContentPool 演化** | 每日定时（根据 era 频率） | `llm/dispatcher.ts:155-177` → `:344-363` → `simulation/content-pool-materializer.ts` | LLM 生成新的 room template / name pool / 标签更新等，写入运行时 ContentPool + 持久化到 `evolve/*.yaml` |
| **聚落生长** | 人口/繁荣度超阈值 | `llm/dispatcher.ts:106-152` → `:325-342` | LLM 生成新房间 + NPC + Faction，通过 `simulation/materializer.ts` 物化 |
| **房间探索生成** | 玩家走向未知出口 | `llm/room-generator.ts:74` — tool_calling 模式 | LLM 生成新房间描述 + 可选 NPC，使用 `create_room` + `add_npc` 工具 |
| **每日摘要** | 回合结算后 | `core/round-engine.ts:415` — 内联 prompt | 为每个玩家生成个性化日报叙事 |

---

## 触发→调度→持久化 全链路

### 已激活的 trigger detection（`llm/dispatcher.ts`）

```
createTriggerDetector() 检查 4 类条件:

1. world_event (line 56-79)
   Gate: cfg.worldEvent.enabled
   条件: 遍历 region → prosperity < 40 OR threatLevel > 60 → 标记为热点
   产出: cfg.worldEvent.perSettlement 个 InteractionRequest, priority="medium"

2. memory_compression (line 82-103)
   Gate: cfg.memoryCompression.enabled
   条件: 过滤非背景 NPC → recentMemoryCount > minMemoriesToTrigger
   批量: 按记忆数排序，上限 maxCandidates 个 NPC
   产出: InteractionRequest, priority="low"

3. settlement_growth (line 106-152)
   Gate: cfg.settlementGrowth.enabled
   条件: npcCount > roomCount*npcToRoomRatio OR (prosperity>阈值 AND threatLevel<阈值)
   产出: InteractionRequest, priority="medium"

4. content_pool_evolve (line 155-177)
   Gate: cfg.contentPoolEvolve.enabled
   条件: day === checkDay AND month > 0 AND round > 0
   产出: InteractionRequest, priority="low"
```

### 未实现的 trigger detection

以下字段在 `LLMTriggerConfig` 中定义且有 `enabled` 开关，但 dispatcher 无对应检测代码：

- `narrativeDirection` — 无 trigger
- `culturalEvolution` — 无 trigger
- `discoveryGeneration` — 无 trigger

### 调度执行 pipeline

```
RoundEngine.settleDay() (core/round-engine.ts:244)
  → dispatcher.runSettlementBatch(world, requests)
  → 对每个请求并行调用 dispatcher.execute(world, request):
      ├─ "world_event"       → adapter.chat → parseWorldEventOutput → 返回 SimulationDelta
      ├─ "memory_compression" → adapter.chat → parseWorldEventOutput → 返回 SimulationDelta
      ├─ "settlement_growth"  → adapter.chat → parseSettlementGrowthOutput → materialize() (直接写入)*
      └─ "content_pool_evolve"→ adapter.chat → regex JSON parse → applyContentPoolMutation() (直接写入)*
  → 所有 delta 通过 applyDelta() 应用
  → writeEvolveDeltas() 持久化到 evolve/*.yaml
```

> **\* 注意**：`settlement_growth` 和 `content_pool_evolve` 当前绕过了 `SimulationDelta` 管道，直接调用 `materialize()` 和 `applyContentPoolMutation()` 写入世界状态。这与 AGENTS.md 规则"_LLM 产出统一走 SimulationDelta → applyDelta → state_update_"不符。

### Tool Calling vs JSON 解析

| 流程 | 使用 Tool Calling? | 工具传入 LLM? | 解析方式 |
|------|:---:|:---:|---------|
| 房间生成 (`room-generator.ts`) | 是 | `create_room`, `add_npc` + `toolChoice: "required"` | `tool-mutations.ts — worldMutationFromToolCalls()` |
| 对话回复 (`dialogue-generator.ts`) | 是 | `DIALOGUE_TOOLS` (5 个工具) | `dialogue-generator — processToolCalls()` |
| 对话选项 (`dialogue-generator.ts`) | 否 | — | 原始 JSON 数组 |
| 世界事件 (`dispatcher.ts`) | 否 | — | `output-parser.ts — parseWorldEventOutput()` |
| 记忆压缩 (`dispatcher.ts`) | 否 | — | `output-parser.ts — parseWorldEventOutput()` (复用) |
| 聚落生长 (`dispatcher.ts`) | 否 | — | `parseSettlementGrowthOutput()` (原始 JSON) |
| ContentPool 演化 (`dispatcher.ts`) | 否 | — | regex JSON 提取 (无 schema 校验) |

### 孤儿工具

以下 ToolDefinition 对象已定义但从不动用——定义的交互走的是 JSON 解析而非 function calling：

| 工具 | 定义位置 | 应服务于 |
|------|---------|---------|
| `add_need` | `tools/content-pool-evolve.ts` | ContentPool 演化 — 但 dispatcher 走原始 JSON |
| `add_action` | `tools/content-pool-evolve.ts` | 同上 |
| `add_schedule` | `tools/content-pool-evolve.ts` | 同上 |
| `create_room` (在 settlement_growth 中) | `tools/room-mutation.ts` | 聚落生长 — 但 dispatcher 走原始 JSON |
| `add_npc` (在 settlement_growth 中) | `tools/room-mutation.ts` | 同上 |

### 缺失的 ToolDefinition

`tool-mutations.ts` 的 `contentPoolMutationFromToolCalls()` 处理 `add_room_template`、`add_name_pool`、`add_quest_template`——但没有任何文件中定义过对应的 `ToolDefinition` 对象。LLM 永远不可能调用这些工具。

---

## 交互筛选矩阵

| # | 交互 | 必要性 | 稀缺性 | 边界性 | 说明 |
|---|------|--------|--------|--------|------|
| 1 | 世界初始化 | ✓ | — | ✓ | 半自动生成，稀缺性要求不高 |
| 2 | 宏观叙事方向 | ✓ | ✓ | ✓ 权重偏转 | 核心交互 |
| 3 | 文化演化 | ✓ | ✓ | ✓ 标签加载 | 低频高价值 |
| 4 | 发现/发明生成 | ✓ | ✓ | ✓ 解锁行为 | 世界进步感 |
| 5 | 世界事件注入 | ✓ | ✓ | ✓ 数值 delta | 核心交互 |
| 6 | NPC 记忆压缩 | ✓ | ✓ | ✓ trait delta | NPC 人格演化 |
| 7 | 对话生成 | ✓ | ✓ | ✓ SimulationDelta | 玩家最直接感知 |
| 8 | 谣言变形 | ✓ | ✓ | ✓ 文本替换 | 低成本高叙事价值 |
| 9 | 涟漪评估 | ✓ | ✓ | ✓ 批量 delta | 替代 O(n²) 手写分支 |
| 10 | 死亡/退出涟漪 | ✓ | ✓ | ✓ 事件链 | 涟漪的子场景 |
| 11 | 派系行为生成 | ✓ | ✓ | ✓ 行为模板 | 集体行动多样性 |
| 12 | 冲突仲裁 | ✓ | ✓ | ✓ 裁决+叙事 | 低频关键 |
| 13 | 对峙叙事化 | ✓ | ✓ | ✓ 场景文本 | 叙事增强 |
| 14 | 组织形式演化 | ✓ | ✓ | ✓ 治理+行为 | Auto research 引擎 |
