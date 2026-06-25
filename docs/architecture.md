---
name: architecture
description: >
  整体架构：项目定位、技术分层、模块职责、文件结构、协议、TUI 布局、核心约束。
  Use for: architecture design, subsystem changes, cross-cutting concerns, understanding module boundaries.
---

# 00 — 整体架构设计

## 1. 项目定位

**开源 MUD 游戏框架**。核心创新在于 **LLM 作为 P 社式规则引擎的内容造血器官**。

### LLM 的真实角色

```
传统 P 社模型:
  规则引擎 (trait/need/relation/schedule)
  + 手写内容池 (事件/科技/文化/法律)
  → 内容池是死的，玩家玩到后期都知道会发生什么

World Framework:
  规则引擎 (trait/need/relation/schedule)
  + LLM 作为内容池的造血器官
  → 内容池自生长，每次运行路径不同
```

**LLM 不是 NPC 的大脑，LLM 是规则引擎的自我迭代模块。**

当规则检测到变化需求（地理隔离触发了方言分化、集体创伤触发了新的宗教需求、反复纠纷触发了立法需求），但手写内容池中没有匹配项时，LLM 负责生成候选项。规则引擎负责裁决采纳、物化到世界状态、驱动传播。

**LLM 永远不决定"是否发生演化"，只负责"如果发生演化，可以演化成什么"。**

### 演化流水线（5 阶段）

```
检测(规则) → 生成(LLM) → 裁决(规则) → 物化(规则) → 传播(规则)
```

LLM 只在阶段 2 介入。其余四个阶段都是规则层，不需要 LLM。

### LLM 交互场景

最多 14 种交互（按触发频率分：一次性 / 每月 / 每日 / 按需），详见 [llm-interactions.md](./llm-interactions.md)。

---

## 2. 产品功能

```
┌───────────────────────────────────────────────────────────┐
│                     产品功能图                              │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  【功能 1: 玩家交互】       【功能 2: 世界模拟】              │
│  经典 MUD 命令             每回合 NPC 行为                  │
│  ┌──────────────┐         ┌──────────────┐                │
│  │ move north   │         │ schedule 执行 │                │
│  │ look         │         │ need 衰减    │                │
│  │ talk <npc>   │         │ trait 影响   │                │
│  │ take <item>  │         │ relation 变化 │                │
│  │ rest         │         │              │                │
│  │ inventory    │         │              │                │
│  └──────┬───────┘         └──────┬───────┘                │
│         │                        │                        │
│         └────────┬───────────────┘                        │
│                  ▼                                        │
│         【功能 3: 世界演化】     【功能 4: 信息推送】         │
│         LLM 触发检测            AOI 过滤                   │
│         ┌──────────────┐       ┌──────────────┐           │
│         │ 世界事件注入  │       │ EventLog     │           │
│         │ NPC 记忆压缩  │       │ 日报生成    │           │
│         │ 聚落生长      │       │ 状态推送    │           │
│         │ ContentPool   │       │ 对话选项    │           │
│         │   自迭代      │       │             │           │
│         └──────────────┘       └──────────────┘           │
│                                                           │
│  核心约束:                                                 │
│  • 功能 1 + 功能 2 → 纯规则，不调 LLM                      │
│  • 功能 3 → LLM 只在规则检测到"需要新内容但手写池无匹配"时触发 │
│  • 功能 4 → 只读不写                                       │
│  • 所有 LLM 产出 → SimulationDelta → 规则层消费             │
└───────────────────────────────────────────────────────────┘
```

### 功能之间的调用关系

```
功能 1 (玩家交互)      功能 2 (世界模拟)
  │                       │
  │  每次动作消耗 rest     │  每回合自动运行 NPC schedule
  │  rest ≤ 10 → 结束     │  产出 SimulationDelta
  │       │               │
  └───┬───┘               │
      │                   │
      ▼                   ▼
  功能 3 (世界演化) ← 结算阶段批量触发 LLM
  产出 WorldMutation / ContentPoolMutation / SimulationDelta
      │
      ▼
  功能 4 (信息推送) ← 任何状态变化后通过 AOI 过滤推送
```

### 时间模型（消耗驱动回合制）

每次交互消耗 rest（行动力），rest 耗尽则自动结束当日。玩家在有限精力内决定今天做什么，自然推动回合推进。

```
游戏日 (Round)
  玩家自由行动 (每次消耗 rest)
  结束条件: 玩家主动结束 / rest 耗尽
  所有在线玩家结束 → 结算:
    simulation.runDay() → dispatcher.runSettlementBatch() → advanceDay() → 日报推送
```

---

## 3. 玩家交互设计

采用**经典 MUD 命令 + 按钮**模式，不使用自然语言输入。

### 命令空间

```
个体命令 (所有 Entity 可用):
  move <direction>       移动到相邻房间
  look [target]          观察房间或实体
  talk <npc>             与 NPC 交谈 (触发对话选项)
  say <message>          在房间内说话
  take <item>            拾取物品
  use <item>             使用物品
  inventory              查看背包
  status                 查看自身状态
  rest                   休息恢复精力

组织命令 (控制 Faction 时可用，由属性动态推导):
  levy_tax / declare_war / form_alliance / appoint / issue_edict / ...
```

命令的可用性由 Entity 属性动态推导。

### 对话交互（LLM 辅助）

不使用自由文本输入。采用 LLM 生成选项 + 用户选择：

1. 玩家点击 NPC 的 [交谈] 按钮 → 服务端调 LLM 生成 3-5 个对话选项
2. 选项基于 NPC 性格 + 对玩家的关系 + 近期记忆
3. 玩家用数字键或鼠标选择选项
4. 服务端调 LLM 生成 NPC 回复 → 走 SimulationDelta 管道

**设计理由**：消除自然语言解析的边界问题和歧义；LLM 与交互层完全解耦；玩家输入可控，NPC 回复个性化。

---

## 4. 技术架构

### 分层架构（5 层）

```
┌─────────────────────────────────────────────────────────┐
│  Layer 5: Client (客户端)                                │
│  职责: 渲染终端 UI、WebSocket 连接、按钮交互、状态展示      │
│  ★ 不调 LLM ★ 只消费服务端推送的状态和能力列表              │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Network (网络)                                 │
│  职责: WebSocket 连接管理、Session、消息路由、状态推送       │
│  ★ 无游戏逻辑，不调 LLM ★                                │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Engine (引擎)                                  │
│  职责: 命令解析 + 执行 + SimulationDelta 应用              │
│  ★ 不调 LLM ★（所有 LLM 调用通过 dispatcher 管道）         │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Simulation (模拟)                              │
│  职责: 纯规则演算 (schedule/need/trait/relation)，只读 ContentPool  │
│  ★ 永远不调 LLM ★                                        │
├─────────────────────────────────────────────────────────┤
│  Layer 1: LLM Service (LLM 服务)                         │
│  职责: LLM 调用 + 结构化输出解析                          │
│  ★ 不持有世界状态 ★ 世界状态由参数传入                     │
├─────────────────────────────────────────────────────────┤
│  Layer 0: Core (核心)                                    │
│  职责: 共享类型定义、WorldState CRUD、YAML 加载器          │
└─────────────────────────────────────────────────────────┘
```

### 关键设计决策

| 决策 | 理由 |
|------|------|
| 玩家交互用按钮 + MUD 命令 | 消除自然语言解析的边界问题 |
| LLM 对话选项代替自由文本 | 玩家输入可控，NPC 回复个性化 |
| 对话生成走 SimulationDelta 管道 | 与所有 LLM 产出统一，复用 applyDelta |
| Engine 层独立于 Simulation 层 | Engine 管"命令执行"，Simulation 管"规则演算" |
| 所有内容数据从 ContentPool 或 YAML 加载 | 代码中不硬编码数据 |
| LLM prompt 动态注入 ContentPool | 不手写 type/trait 列表 |
| 每个动作消耗 rest，耗尽结束当天 | 玩家有行动次数上限，自然推动回合推进 |
| LLM 触发频率配置化 | 调试/测试/MVP/生产 可独立调节 |

---

## 5. 核心架构约束（不可违反）

1. **内容在 ContentPool，逻辑在引擎** — 引擎代码只读 ContentPool，不硬编码任何内容数据
2. **所有内容从 YAML/JSON 加载** — 世界定义、NPC、need、schedule、action 效果
3. **LLM 角色限定** — 只在规则检测到"需要新内容但手写池无匹配"时触发；永远不决定"是否发生"，只负责"可以发生什么"
4. **玩家交互不调 LLM** — 命令解析和执行全走规则层，对话选项走 dialogue-generator 管道
5. **LLM 产出统一格式** — 全部走 SimulationDelta → applyDelta → state_update
6. **类型体系** — Entity 能力由属性动态推导，不用枚举定义角色类型
7. **时间模型** — 消耗驱动回合制：每次交互消耗 rest，rest ≤ 10 自动结束当天
8. **LLM 触发频率配置化** — 所有阈值从 `ContentPool.llmTriggerConfig` 读取，不在代码中硬编码

---

## 6. WebSocket 协议

协议定义在 `src/shared/protocol.ts`，所有消息均遵循 `WsMessage` 联合类型。

### 消息一览

| 方向 | 消息 | 用途 |
|------|------|------|
| S→C | `init` | 连接时发送可选 Entity 列表 |
| C→S | `bind_entity` | 玩家选择绑定实体 |
| S→C | `bound` | 绑定确认 |
| S→C | `state_update` | 状态变化推送（entity + room + capabilities） |
| C→S | `execute` | `{action, params}` 执行命令 |
| S→C | `command_result` | 命令结果（events + delta + ended） |
| C→S | `request_dialogue_options` | 请求对话选项 |
| S→C | `dialogue_options` | NPC 对话选项列表 |
| C→S | `talk` | 选择对话选项 |
| S→C | `daily_report` | 每日结算报告 |
| S→C | `status` | 服务器状态 |
| S→C | `error` | 错误（code + message + suggestion） |

---

## 7. 技术栈

| 层 | 技术 |
|----|------|
| 语言 | TypeScript |
| 服务端运行时 | Node.js |
| 客户端运行时 | Bun |
| 游戏服务端 | ws + YAML + zod |
| 终端客户端 | OpenTUI (Zig 核心) + Solid.js |
| LLM | OpenAI 兼容 API |
| 测试 | Vitest |
| Lint/Format | Biome |

---

## 8. 子系统 × 分层矩阵 (2026-06 同步)

| 子系统 | core | engine | simulation | combat | llm | server | client-tui | 实现度 |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|--------|
| 对话 | — | `command-executor` | — | — | `dialogue-generator` `dialogue-tools` | `ws-server` 选项中继 | `app.tsx` 对话 Modal | 大部分完成 |
| 任务 | `types.ts` quest 类型 | `quest-tracker` `act-loop` | `storyline-engine` | — | dialogue `offer_quest` tool | `ws-server` quest 推送 | QuestPanel | 大部分完成 |
| 场景交互 | `types.ts` tags | `capability-provider` `command-executor` | — | — | — | — | — | 部分实现 |
| 社交涟漪 | — | `delta-composer` `act-loop` | `social-ripple` | — | — | — | — | 已完成 |
| 战斗 | — | `command-executor` 战斗命令 | — | 8 文件 (公式/脉冲/AI) | `combat-narration` (未接入) | — | 战斗状态显示 | 大部分完成 |
| NPC 生活/日程 | `round-engine` `memory` | `act-loop` | `simulation/index` (schedule/need) | — | dispatcher 日报摘要 | — | — | 大部分完成 |
| 地图/导航 | `pathfinding` `schemas/graph` | `command-executor` move | — | — | `room-generator` 探索 | `ws-server` minimap | MapPanel 双粒度 | 已完成 |
| 记忆 | `memory` | `delta-registry` 记忆事件 | — | — | `memory-compression` prompt | — | — | 已完成 |
| 经济/物品 | `types.ts/world.ts` 物品创建 | `command-executor` take/drop/use | — | — | dialogue `exchange_item` | — | 背包分组 | 大部分完成 |
| 世界演化 | `content-pool-loader` `types.ts` | — | `content-pool-materializer` `materializer` | — | dispatcher `content_pool_evolve` / `settlement_growth` | — | — | 大部分完成 |
| 历史/传说 | — | — | — | — | dispatcher `world_event` (事件注入) | — | — | 待实现 |

> 实现度标签： 已完成 / 大部分完成 / 部分实现 / 待实现

### 代码模块对应关系

| 层 | 目录 | 核心文件 |
|----|------|---------|
| 0. Core | `src/core/` | `types.ts` (类型定义), `world.ts` (WorldState CRUD), `content-pool-loader.ts` (YAML加载), `round-engine.ts` (回合调度), `memory.ts`, `pathfinding.ts`, `event-bus.ts` |
| 1. LLM | `src/llm/` | `adapter.ts` (API封装), `dispatcher.ts` (触发检测+调度), `dialogue-generator.ts` (对话生成), `room-generator.ts`, `world-generator.ts` |
| 2. Simulation | `src/simulation/` | `index.ts` (schedule/need/action权重), `social-ripple.ts`, `content-pool-materializer.ts`, `materializer.ts`, `storyline-engine.ts` |
| 3. Engine | `src/engine/` | `command-executor.ts` (命令执行), `capability-provider.ts`, `delta-composer.ts`, `delta-registry.ts`, `act-loop.ts`, `quest-tracker.ts` |
| — Combat | `src/combat/` | `types.ts`, `formulas.ts`, `resolver.ts`, `pulse.ts`, `ai.ts`, `incapacitation.ts` |
| 4. Network | `src/server/` | `ws-server.ts` (WebSocket服务) |
| 5. Client | `src/client-tui/` | `app.tsx` (主TUI组件), `game-client.ts` (状态管理), `key-layer.ts` (键位绑定) |
| Shared | `src/shared/` | `protocol.ts` (消息类型), `log.ts`, `directions.ts` |
