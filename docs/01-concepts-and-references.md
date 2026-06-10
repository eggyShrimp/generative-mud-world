---
name: concepts-references
description: >
  关键概念定义、MVP 范围、参考资料。
  Use for: understanding terminology, checking MVP scope, looking up design references.
---

# 01 — 概念与参考

## 关键概念

| 概念 | 说明 |
|------|------|
| **World** | 世界容器，包含所有区域和实体 |
| **Room** | 空间单元，NPC/玩家所在的位置，房间之间有出口连接 |
| **Region** | 区域，包含多个 Room，有繁荣度/威胁度等宏观属性 |
| **Entity** | 世界中一切事物的基类（NPC、Player、Item、Faction） |
| **NPC** | 规则驱动 + LLM 辅助的角色，有记忆、性格、目标、schedule |
| **Player** | 通过 WebSocket 连接的真人玩家，控制任意 Entity |
| **Faction** | 组织实体，由 NPC 组成，有治理形式、经济基础、军事力量 |
| **Action** | 实体可执行的动作（move、talk、take、rest 等） |
| **ContentPool** | 可演化数据层，存放所有声明式内容（need 定义、action 效果、schedule 模板等） |
| **SimulationDelta** | LLM 产出的统一格式，包含 needChange/traitModifier/relationChange 等 |

## 子系统覆盖度 (2026-06 同步)

| 子系统 | 状态 | 核心模块 |
|--------|------|---------|
| 对话 | 大部分完成 | `llm/dialogue-generator.ts` / `dialogue-tools.ts` |
| 任务 | 大部分完成 | `engine/quest-tracker.ts` (548行) / `simulation/storyline-engine.ts` |
| 场景交互 | 部分实现 | Room tag 路由已存在，缺 roomType/facilities 模型 |
| 社交涟漪 | 已完成 | `simulation/social-ripple.ts` |
| 战斗 | 大部分完成 | `combat/` (8文件) — 公式/脉冲/AI/倒地 |
| NPC 生活/日程 | 大部分完成 | `simulation/index.ts` / `core/round-engine.ts` |
| 地图/导航 | 已完成 | `core/pathfinding.ts` (BFS/A*) / TUI 地图面板 |
| 记忆 | 已完成 | `core/memory.ts` — 7种记忆创建 + LLM 压缩 |
| 经济/物品 | 大部分完成 | 拾取/使用/装备/对话交易/任务奖励 |
| 世界演化 | 大部分完成 | `content-pool-materializer.ts` + dispatcher |
| 历史/传说 | 待实现 | 零代码 — `06-content-pool.md` 记录缺口 |

## MVP 范围

1. **世界引擎** — 房间图、实体管理、回合调度
2. **NPC 系统** — Trait、Schedule、短期记忆、LLM 对话
3. **动作系统** — 经典 MUD 命令（move/look/talk/take/rest/wait）
4. **LLM 适配器** — OpenAI 兼容 API
5. **WebSocket 服务** — 玩家连接、命令执行、状态推送
6. **终端 UI** — OpenTUI + Solid.js 终端客户端
7. **世界配置** — YAML 定义房间、NPC、物品

## 超出 MVP 但已实现的

以下系统设计文档中列为"不在 MVP"，但已落地：

- **战斗系统** (`combat/`) — 属性推导/回合脉冲/NPC AI/倒地与死亡
- **任务系统** (`engine/quest-tracker.ts`) — 5 种目标类型/AND-OR 组合/剧情多阶段
- **NPC 记忆压缩** (`core/memory.ts` + `llm/prompts/memory-compression.ts`) — 每日触发
- **世界事件注入** (`llm/dispatcher.ts` world_event) — 按聚落批量生成
- **地图面板** (TUI) — 双粒度（区域/世界）/ 路径连接 / 探索状态

## 明确未实现（配置中 enabled: false 或无代码）

- 历史系统（`HistoricalEvent` / `LoreFragment` — 零代码）
- 文化演化 / 发现生成（`llmTriggerConfig` 中 `enabled: false`，dispatcher 无触发代码）
- 叙事方向（`narrativeDirection` — 配置存在但 `enabled: false`）
- 组织形式演化（设计完备，`04-auto-research.md`，但 dispatcher 无触发代码）
- 语言演化系统（设计完备，无代码）
- 持久化存储（仍用内存 + YAML，无数据库）
- 用户认证

## 参考资料

### MUD 引擎（设计架构参考）

| 项目 | 语言 | Stars | 核心亮点 |
|------|------|-------|----------|
| **Ranvier** | JS/Node.js | 842 | Bundle 插件系统、Entity 系统、事件驱动行为、可替换网络层 |
| **Evennia** | Python | 2.1k | Typeclass 模式、Django ORM 持久化、内置 Web 客户端 |

**Ranvier 关键设计理念：**
- **Bundle 系统**：房间/NPC/物品/命令/技能以 "bundle" 形式组织，可插拔
- **Entity 分层**：Area → Room → NPC/Item/Player 按区域组织
- **Behavior**：可组合的 NPC 行为脚本，挂载到实体上响应事件
- **Event-driven**：实体发出事件，behavior 监听并响应

**Evennia 关键概念：**
- **Typeclass 模式**：数据库对象可在运行时动态添加属性
- **Command system**：命令解析器，支持缩写、多语言、权限控制
- **Script system**：独立于实体的定时任务/全局状态机

### LLM Agent 世界（概念参考）

| 项目 | Stars | 核心亮点 |
|------|-------|----------|
| **Google DeepMind Concordia** | 1.4k | 生成式社会模拟库，Agent 感知→思考→行动流水线，Game Master 模式 |
| **WorldX** | 976 | TypeScript，一句话生成世界 + Agent 自主驱动故事 |
| **GOD** | 528 | Agent 社会实时控制台，可视化监控交互 |
| **Stanford Generative Agents** | 17k+ | 记忆系统（observation→reflection→plan）是核心 |

**Generative Agents 核心架构：**
- **记忆流 (Memory Stream)**：Agent 所有经历按时间排列
- **检索机制**：近期性 + 重要性 + 相关性三维打分取记忆
- **反思 (Reflection)**：定期将多条记忆聚合成高层次认知
- **计划 (Plan)**：每天/每小时生成计划树，动态调整

**Concordia 核心洞察：**
- **Entity-Component + Game Master 模式**：GM 是 LLM 驱动的世界管理员，负责环境模拟和行为裁决
- 三种使用模式：Simulationist（科学建模）、Dramatist（叙事驱动）、Evaluationist（评估系统）

### 学术参考

| 论文 | 与我们思路的重合点 |
|------|-------------------|
| **PANGeA (2024)** | AA 叙事生成，LLM 作导演规划宏观情节，规则系统执行细节 |
| **StoryVerse (2024)** | LLM 做 narrative planning，角色 simulation 做执行 |
| **Word2World (2024)** | LLM 从一句话生成完整世界 |
| **PCG Survey with LLM (2024)** | 程序化内容生成与 LLM 集成的系统综述 |
