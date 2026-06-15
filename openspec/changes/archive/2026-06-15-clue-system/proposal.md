# Proposal: clue-system

## Why

NPC 对话现在可以通过 `share_information` 分享信息，但这些信息只进入事件日志。玩家后续执行搜索、移动、任务发现等交互时，引擎无法检查玩家知道什么。对话内容因此停留在文本层，不能成为玩法的一部分。

本变更引入线索系统。线索系统把世界中已经存在的隐藏事实建模为 `ClueDefinition`，把玩家通过对话获得的信息记录为 `KnownClue`，再让引擎用这些线索解锁隐藏物品、隐藏出口和任务发现。

核心链路如下：

```text
ClueDefinition（ContentPool）
  -> NPC 对话分享
  -> PlayerEntity.knownClues
  -> 搜索/移动/任务发现检查
  -> PlayerEntity.discoveredEntities 或公共世界变化
```

## Change Type

**cross-cutting feature** — new-feature

此功能跨越两个 OpenSpec schema，不能作为单个 `world-engine` change 直接实施：

| Schema | Owns | Why it is separate |
|--------|------|--------------------|
| `world-yaml` | `ContentPool.clueDefinitions`、Zod schema、YAML 数据、loader routing、evolve write-back | 线索是世界数据。引擎只能读取已经验证和加载的 ContentPool 数据。 |
| `world-engine` | 对话获得线索、玩家已知线索、个人发现状态、搜索和移动门控 | 引擎负责把线索转成玩家状态，并在交互时消费这些状态。 |

当前目录保留为 umbrella plan。实施前应拆出至少两个 schema-specific changes：

- `clue-content-pool` (`world-yaml`)
- `clue-engine` (`world-engine`)

本次不做新的 TUI 面板。客户端通过已有事件日志和房间实体列表看到结果。

## Modules Touched

以下列表描述完整功能涉及的文件。拆分实施时，按 schema 边界分配这些文件：

| File | Change Type | Description |
|------|-------------|-------------|
| `src/core/types.ts` | add-interface / add-field | 新增 `ClueDefinition`、`KnownClue`、`KnownClueChange`、`DiscoverableCondition`、`DiscoverableChange`；`ContentPool`、`PlayerEntity`、`ItemEntity`、`SimulationDelta` 增加对应字段 |
| `src/core/schemas/content-pool.ts` | add-schema | 新增 `ClueDefinitionSchema`，并把 `clueDefinitions` 加入 `ContentPoolSchema` |
| `src/core/schemas/exit.ts` | modify-schema | `ExitConditionSchema.type` enum 扩展 `"clue"` |
| `src/core/content-pool-loader.ts` | modify-routing | 把 `clueDefinitions` 注册到 YAML domain 和 write-back 路径 |
| `src/simulation/content-pool-materializer.ts` | modify-function | 支持 `addClueDefinitions` mutation |
| `src/core/world.ts` | modify-function | `createPlayer` 初始化 `knownClues` 和 `discoveredEntities`；`applyDelta` 处理 `knownClueChanges` 和 `discoverableChanges` |
| `src/engine/delta-composer.ts` | modify-function | 合并 `knownClueChanges` 和 `discoverableChanges` |
| `src/llm/dialogue-tools.ts` | modify-function | `share_information` tool 新增可选 `clue_id` 参数 |
| `src/llm/dialogue-generator.ts` | modify-function | 注入 NPC 已知线索；校验 `clue_id` 存在且当前 NPC 知道该线索；产出 `knownClueChanges` |
| `src/engine/command-executor.ts` | modify-function | 搜索类房间动作检查线索并产出 `discoverableChanges`；隐藏出口检查 clue 条件 |
| `src/engine/capability-provider.ts` | modify-function | 按玩家 `discoveredEntities` 过滤隐藏实体、拾取目标、查看目标和出口 |
| `src/server/ws-server.ts` | modify-function | 调用 `getRoomEntitiesInfo` 时传入玩家 ID，使房间实体列表能按玩家状态过滤 |
| `src/core/save-manager.ts` / `src/core/schemas/save-data.ts` | evaluate / modify | 明确玩家线索和发现状态是否随实体一起保存；如果当前实体状态不持久化，则补充 SaveData capture/restore |
| `worlds/content-pool/social-dialogue.yaml` | add-data | 增加初始 `clueDefinitions` 示例 |

## ContentPool Reads

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| `clueDefinitions` (new) | `src/llm/dialogue-generator.ts` | 读取当前 NPC 知道的线索，并注入对话 prompt |
| `clueDefinitions` (new) | `src/llm/dialogue-generator.ts` | 校验 LLM 返回的 `clue_id` 存在且属于当前 NPC |
| `clueDefinitions` (new) | `src/engine/command-executor.ts` | 可选：搜索发现时读取线索描述，用于事件文本模板参数 |

## State Model

本变更区分三类状态：

| State | Owner | Meaning |
|-------|-------|---------|
| `ItemEntity.discoverable` | item | 物品默认隐藏，需要满足发现条件。这是内容配置，不因某个玩家发现而删除。 |
| `PlayerEntity.knownClues` | player | 玩家已经知道哪些线索。对话获得线索时写入。 |
| `PlayerEntity.discoveredEntities` | player | 玩家已经发现哪些隐藏实体。搜索成功时写入。 |

`discoverableChanges` 表达个人发现：

```ts
interface DiscoverableChange {
  playerId: EntityId;
  entityId: EntityId;
  operation: "discover";
}
```

本变更不把发现状态合并进 `itemChanges`。`itemChanges` 当前只表示背包数量变化，目标必须是有 inventory 的实体。隐藏物品可见性变化属于实体可见性状态，不属于背包增删。

## Scope Boundaries

本变更只实现个人发现。一个玩家发现隐藏物品后，其他玩家不会自动看到该物品。

本变更不实现公共揭示。打开密门、挖出宝箱、拆除遮挡物这类会改变公共世界的行为，应在后续 change 中引入单独的公共世界变化。

本变更不让 NPC 临场编造线索。NPC 只能分享 `ContentPool.clueDefinitions` 中存在，并且 `knownByNpcIds` 包含当前 NPC ID 的线索。

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new `Record<string,string>`) | no | 不新增标签映射表 |
| no-direct-world-mutation (push/assign to state) | yes | 玩家线索和发现状态通过 `SimulationDelta` + `applyDelta` 写入 |
| no-create-default-outside-world | yes | `clueDefinitions` 默认值只在 `createDefaultContentPool()` 中定义 |
| no-hardcoded-description-text (Chinese in engine/combat) | yes | 事件文本从 `narrativeTemplates.commandMessages` 或现有事件模板生成 |
| no-empty-catch | no | 不新增 catch 块 |

## Impact

- 新增玩法：对话获得的信息能影响探索、移动和任务发现。
- 新增玩家状态：`knownClues` 和 `discoveredEntities` 需要初始化、传递、测试，并确认是否持久化。
- 新增内容数据：`clueDefinitions` 必须走 ContentPool 字段 checklist。
- 房间实体列表会变成玩家相关。同一房间对不同玩家可以显示不同实体。
- 隐藏出口可以通过 clue 条件变成可见或可通行。
