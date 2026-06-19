---
name: quest-evaluator-registry
description: >
  Quest 目标检测重构：引入任务目标定义注册表、行为事件输入和 core 层查询 API。
  解决目标类型硬编码、进度检测依赖命令参数、对话系统缺少中间任务交互、
  以及 llm/simulation 反向依赖 engine 的问题。
status: draft
---

# Quest 目标检测重构

## 完成标准

这个需求可以一次性定义，但实现必须分阶段验收。每个阶段完成后，游戏都应保持可运行，现有任务仍能接取、推进、完成和展示。

完成时必须满足：

1. 新增任务目标类型不需要改 `QuestObjective.type` enum、schema enum、多个 switch。
2. `evaluateQuestImpacts()` 不再接收 `action` / `targetId` 命令层参数。
3. NPC 对话可以发现当前 NPC 关联的活跃任务目标，包括中间 talk 目标。
4. `llm/` 和 `simulation/` 不再直接依赖 `engine/quest-tracker.ts` 的内部任务工具。
5. LLM 生成任务使用新的目标格式，并只能使用注册表公开的目标类型。
6. 内容池加载、任务追踪、对话任务入口、任务面板展示、剧情推进测试通过。

## 当前问题

### 1. QuestObjective.type 硬编码 3 层

当前目标类型写死在三处：

```typescript
// core/types.ts
type: "explore" | "collect" | "talk" | "deliver" | "fetch"

// core/schemas/content-pool.ts
z.enum(["explore", "collect", "talk", "deliver", "fetch"])

// engine/quest-tracker.ts
switch (obj.type) { case "explore": ... case "talk": ... }
```

每加一种目标类型都要同步改类型、schema、检测逻辑和相关展示逻辑。

### 2. 检测逻辑耦合命令层

`evaluateQuestImpacts()` 接收 `action` / `targetId`，导致任务检测必须知道玩家发了什么命令。任务目标应该关心“发生了什么”，而不是关心命令参数怎么命名。

### 3. 对话系统缺少中间任务感知

当前对话菜单主要能发现：

- `giverNpcId` 对应的任务接取入口
- `giverNpcId` 对应的任务交付入口

但活跃任务中的中间目标 NPC 无法稳定出现在对话菜单里。例如“先找法显，再去玉门烽燧，再向张校尉求证”这种任务，中间 NPC 应该成为明确的任务对话意图。

### 4. 跨层依赖方向错误

`llm/dialogue-generator.ts` 和 `simulation/storyline-engine.ts` 直接导入 `engine/quest-tracker.ts` 的纯任务工具。任务可用性、前置条件、子任务收集、交互查询都属于领域查询能力，应放在 `core/` 层，`engine/` 只负责产生任务进度 delta。

## 设计原则

1. 数据格式在 `ContentPool`，任务检测逻辑在引擎，查询工具在 `core`。
2. 不通过兜底逻辑掩盖旧路径，旧目标格式要么一次性迁移，要么在明确迁移层转换；不能让新旧格式长期并存。
3. 注册表不是只注册 evaluator，还要注册目标类型的完整能力。
4. 事件输入先服务任务系统，不承诺变成全局事件平台。
5. `applyDelta()` 仍然是任务状态写入入口；事件只用于检测，不写世界状态。

## 核心设计

### A. Quest Objective Definition Registry

新增任务目标定义注册表。每个目标类型只在这里注册一次。

```typescript
interface QuestObjectiveCondition {
  type: string;
  target?: {
    kind: "npc" | "room" | "item" | "entity" | "none";
    id?: EntityId;
  };
  params?: Record<string, unknown>;
}

interface QuestObjective {
  groupId: number;
  condition: QuestObjectiveCondition;
  count: number;
  description: string;
}

interface QuestObjectiveDefinition {
  type: string;
  evaluateFromEvent(input: QuestObjectiveEventInput): number;
  evaluateFromWorld(input: QuestObjectiveWorldInput): number;
  isReachable(input: QuestObjectiveReachabilityInput): boolean;
  getInteractionTarget?(input: QuestObjectiveInteractionInput): EntityId | null;
  llmSchemaHint: {
    description: string;
    targetKind: "npc" | "room" | "item" | "entity" | "none";
    params?: Record<string, string>;
  };
}
```

注册表至少包含这些旧类型的等价目标：

| 旧类型 | 新 condition.type | target.kind | 说明 |
|--------|-------------------|-------------|------|
| `talk` | `player_talked_to_npc` | `npc` | 玩家与目标 NPC 完成任务对话 |
| `explore` | `player_reached_room` | `room` | 玩家到达或已知目标房间 |
| `collect` | `player_has_item` | `item` | 玩家持有目标物品 |
| `fetch` | `player_has_item` | `item` | 与 collect 共用检测，语义由描述表达 |
| `deliver` | `player_met_npc` | `npc` | 玩家到达目标 NPC 所在房间 |

注册表必须提供查询函数：

```typescript
getQuestObjectiveDefinition(type: string): QuestObjectiveDefinition | undefined
listQuestObjectiveDefinitions(): QuestObjectiveDefinition[]
```

LLM 工具定义和 prompt 示例只能从 `listQuestObjectiveDefinitions()` 派生可用目标类型，避免工具 schema 和引擎注册表双源维护。

### B. QuestObjective 新格式

旧格式：

```yaml
objectives:
  - groupId: 0
    type: talk
    targetId: npc_monk_faxian
    count: 1
    description: "听法显讲述千佛壁画中的暗码"
```

新格式：

```yaml
objectives:
  - groupId: 0
    condition:
      type: player_talked_to_npc
      target:
        kind: npc
        id: npc_monk_faxian
    count: 1
    description: "听法显讲述千佛壁画中的暗码"
```

`condition.type` 是字符串；具体 target 结构和 params 由注册表声明。schema 只校验通用结构，语义校验由内容池加载阶段调用注册表完成。

### C. Quest Objective Event

新增任务目标检测事件。它是 `SimulationDelta` 内的只读输入，不由 `applyDelta()` 消费。

```typescript
interface QuestObjectiveEvent {
  type: string;
  tick: number;
  actorId: EntityId;
  data: Record<string, unknown>;
}

interface SimulationDelta {
  questObjectiveEvents?: QuestObjectiveEvent[];
}
```

事件命名先服务任务目标：

| 事件 | 生产时机 | 数据 |
|------|----------|------|
| `player_talked_to_npc` | 玩家成功选择一次 NPC 对话选项，包含任务对话选项 | `{ npcId, optionId?, optionType? }` |
| `player_reached_room` | 玩家移动成功后 | `{ roomId }` |
| `player_acquired_item` | 玩家获得物品后 | `{ itemId, templateId?, qty }` |
| `player_delivered_item` | 玩家把物品交给 NPC 后 | `{ npcId, itemId, templateId?, qty }` |
| `player_defeated_entity` | 战斗结束且目标失去行动能力后 | `{ targetId }` |

事件应在“行为已确认成功”之后生成。当前 `moveEntity()` 会在命令执行器中直接改变位置，因此移动事件应描述成功后的房间。不要假设所有行为都只通过 delta 改状态。

### D. 任务进度检测

`evaluateQuestImpacts()` 新签名：

```typescript
evaluateQuestImpacts(world, actorId, delta)
```

实现规则：

1. 事件驱动路径调用 `definition.evaluateFromEvent()`。
2. 全量检查路径调用 `definition.evaluateFromWorld()`。
3. 两条路径必须对旧类型迁移后的语义保持一致。
4. `talk` 类目标不能只依赖本次事件；全量检查必须能通过玩家记忆或其他现有事实补扫，避免异常恢复后任务无法推进。
5. 未注册的目标类型在内容池加载阶段失败，不在运行时静默忽略。

### E. Core 层任务查询 API

新增 `core/quest-utils.ts`，迁移这些纯领域工具：

- `checkPrerequisites()`
- `collectSubQuestIds()`
- `resolveQuestAccept()` 中不依赖 engine 的预解析逻辑，或拆出其纯查询部分
- `getQuestInteractionsForEntity()`

`engine/quest-tracker.ts` 可以使用 core 查询；`llm/` 和 `simulation/` 只能依赖 core 查询，不能反向依赖 engine。

`getQuestInteractionsForEntity()` 不应简单用 `condition.target.id === entityId` 判断。它应通过注册表的 `getInteractionTarget()` 判断某个目标是否能成为 NPC 任务对话入口。

返回结构：

```typescript
interface QuestEntityInteraction {
  questId: string;
  questTitle: string;
  objectiveIndex: number;
  objectiveDescription: string;
  groupId: number;
  isPending: boolean;
  optionId: string;
  optionType: "quest_talk_menu";
}
```

`isPending` 表示前置 group 已完成，当前 group 未完成。尚未 pending 的目标可以用于内部提示，但不应出现在玩家可选菜单中。

### F. 对话系统集成

`dialogue-generator.ts` 从 core 查询任务交互，并把 pending 的 NPC 任务目标渲染为 quest tag 选项。

```typescript
const interactions = getQuestInteractionsForEntity(world, player, npc.id);
for (const interaction of interactions) {
  if (!interaction.isPending) continue;
  options.push(makeContinueOption(
    interaction.optionId,
    interaction.objectiveDescription,
    interaction.optionType,
    { tag: "quest", meta: { questId: interaction.questId, objectiveIndex: interaction.objectiveIndex } },
  ));
}
```

`quest_talk_menu` 表示玩家明确询问该任务目标。处理该选项时必须：

1. 生成 NPC 回答的 dialogue delta。
2. 同步产出 `player_talked_to_npc` 任务目标事件。
3. 返回后续选项，保持现有对话弹窗协议。

客户端已有 `_menu` / `_select` 分类逻辑，新增 `quest_talk_menu` 可自动保持弹窗继续；但仍需补测试锁定该行为。

## 文件变更范围

| 文件 | 改动 |
|------|------|
| `src/core/types.ts` | 新增 `QuestObjectiveCondition`、`QuestObjectiveEvent`，调整 `QuestObjective` 和 `SimulationDelta` |
| `src/core/schemas/content-pool.ts` | objective schema 改为 condition 通用结构，并调用注册表做语义校验 |
| `src/core/quest-objective-registry.ts` | 新增目标定义注册表 |
| `src/core/quest-utils.ts` | 承载前置条件、子任务收集、任务接取查询、NPC 任务交互查询 |
| `src/engine/quest-tracker.ts` | 使用注册表检测目标进度，移除目标类型 switch 和命令参数依赖 |
| `src/engine/delta-composer.ts` | 合并 `questObjectiveEvents` |
| `src/engine/act-loop.ts` | 空 delta 判断包含 `questObjectiveEvents` |
| `src/engine/command-executor.ts` | 成功行为产出任务目标事件 |
| `src/core/round-engine.ts` | 调用新的 `evaluateQuestImpacts()` 签名 |
| `src/llm/dialogue-generator.ts` | 改依赖 core 查询，新增中间任务 NPC 入口 |
| `src/shared/protocol.ts` | 新增 `quest_talk_menu`，必要时新增 `quest_talk_select` |
| `src/server/ws-server.ts` | `enrichQuests()` 适配新 objective 格式 |
| `src/llm/tools/content-pool-evolve.ts` | 从注册表派生 LLM 可用目标类型 |
| `src/llm/prompts/content-pool-evolve.ts` | 示例 quest 改为新格式 |
| `worlds/content-pool/quests.yaml` | 迁移全部 objective |
| `docs/07-quest-storyline.md` | 更新任务目标架构说明 |

## 分阶段实施与验收

### 阶段 1：注册表和数据格式迁移

目标：移除目标类型 enum 和 schema enum，但不改变玩家行为。

范围：

1. 新增 `quest-objective-registry`。
2. 新增 `QuestObjective.condition` 格式。
3. 迁移 `worlds/content-pool/quests.yaml` 和测试 fixture。
4. `quest-tracker` 仍可先通过注册表读世界状态完成旧语义。
5. `enrichQuests()` 和任务面板展示保持原有信息。

验收：

```bash
npm test -- quest-tracker
npm test -- content-pool-loader
npm test -- quest-enrichment
npm run build -- --noEmit
```

必须验证：

- 内容池旧 objective 字段不再出现。
- 未注册 condition type 会加载失败。
- 现有任务可接取、进度可显示。

### 阶段 2：任务事件输入替代命令参数

目标：`evaluateQuestImpacts()` 不再依赖 `action` / `targetId`。

范围：

1. `SimulationDelta` 增加 `questObjectiveEvents`。
2. 成功的 talk、move、item、combat 行为产出事件。
3. `composeDeltas()` 和 act-loop 空判断支持事件。
4. `evaluateQuestImpacts(world, actorId, delta)` 只读 delta 中的任务事件和当前世界状态。

验收：

```bash
npm test -- quest-tracker
npm test -- round-engine
npm test -- act-loop
npm run build -- --noEmit
```

必须验证：

- talk 目标由事件推进。
- explore 目标在移动成功后推进。
- collect/fetch 目标在获得物品后推进。
- 全量检查仍能补扫 talk/explore/collect。

### 阶段 3：core 查询 API 和跨层依赖修正

目标：修正 `llm/`、`simulation/` 到 `engine/` 的反向依赖。

范围：

1. 新增 `core/quest-utils.ts`。
2. 迁移或拆分 `checkPrerequisites()`、`collectSubQuestIds()`、任务接取查询。
3. `dialogue-generator.ts` 和 `storyline-engine.ts` 改依赖 core。
4. `engine/quest-tracker.ts` 保持任务进度 delta 生产职责。

验收：

```bash
rg 'from "../engine/quest-tracker' src/llm src/simulation
npm test -- dialogue-generator
npm test -- storyline-engine
npm run build -- --noEmit
```

`rg` 必须没有结果。

### 阶段 4：中间任务 NPC 对话入口

目标：活跃任务的中间 NPC 目标可被玩家明确选择。

范围：

1. `getQuestInteractionsForEntity()` 通过注册表判断 NPC 交互目标。
2. `dialogue-generator.ts` 注入 `quest_talk_menu`。
3. 选择 `quest_talk_menu` 后生成 NPC 回答并产出任务事件。
4. `protocol.ts` 和客户端测试锁定 `_menu` 行为。

验收：

```bash
npm test -- dialogue-generator
npm test -- game-client
npm test -- integration/dialogue-pipeline
npm test -- quest-tracker
```

必须验证：

- 任务给予者入口仍存在。
- 任务交付入口仍存在。
- 中间 talk NPC 出现 quest 标记选项。
- 点击中间任务选项后任务进度推进。

### 阶段 5：LLM 任务生成接入新格式

目标：LLM 只能生成注册表支持的新 objective 格式。

范围：

1. `content-pool-evolve` tool definition 从注册表派生 condition 类型说明。
2. prompt 示例使用新格式。
3. 生成结果经过内容池 schema 和注册表语义校验。

验收：

```bash
npm test -- llm-dispatcher
npm test -- content-pool-loader
npm run build -- --noEmit
```

必须验证：

- LLM prompt 中有可用 condition 类型说明。
- 非注册 condition type 被拒绝。
- 新生成任务可被加载并进入任务追踪流程。

## 迁移策略

采用 clean break：仓库内 YAML 和测试 fixture 一次性迁移到新格式。不保留长期运行时兼容分支。

允许在迁移脚本或 loader 预处理里临时转换旧格式，但转换逻辑只能用于提交内迁移验证，不能成为长期 fallback。

## 风险和约束

1. 事件生产必须以成功行为为准，不得在可行性检查或失败命令中产出任务事件。
2. 移动、拾取、使用等现有直接写世界状态的路径不能被假设为纯 delta 路径；事件描述的是成功后的事实。
3. 注册表必须同时覆盖进度判断、全量补扫、可达性、NPC 交互目标、LLM 暴露说明。
4. `questObjectiveEvents` 不由 `applyDelta()` 消费，不改变世界状态。
5. 任务状态变化仍必须通过 `questChanges` 进入 `applyDelta()`。
6. 任务目标展示不能把 `condition.type` 直接暴露给玩家，玩家仍看到 `description` 和现有进度文本。

## 最终验证

全部阶段完成后运行：

```bash
npm run build -- --noEmit
npm test
npm run lint
```

并用一个代表性任务手动或脚本验证：

1. 与任务给予者对话接任务。
2. 完成中间 NPC talk 目标。
3. 完成 explore 或 item 目标。
4. 回到交付 NPC 完成任务。
5. 任务面板显示正确进度和完成状态。
