# Design: travelogue-clue-integration

## Data Flow

```
[End of day — round-engine calls generateTravelogueEntry]
  ↓
[buildTraveloguePrompt]
  player.knownClues 过滤 lastTravelogue.createdAt < learnedAt <= world.tick → todayClues
  pool.clueDefinitions lookup clueId → description
  world.entities lookup sourceNpcId → NPC name
  ↓
[Prompt injection]
  今日获悉的线索:
  - {description}（来源：{npcName}）
  ↓
[LLM] 自然融入叙事: "途经莫高窟时，法显提起第十七窟壁画后..."
  ↓
[parseTravelogueOutput] → { title, narrative }
  ↓
[keyEvents 追加]
  events.map(e => e.description)
  + todayClues.map(c => `获悉线索：${description}`)
  ↓
[TravelogueEntry] 写入 player.travelogue[]
  ↓
[TraveloguePanel 渲染] 已有 narrative + keyEvents 显示
```

## ContentPool Integration

### Maintenance chain

`clueDefinitions` 虽然已经是已有字段，但本变更依赖它成为完整的 ContentPool 数据链路。实现游记读取前，必须确认或补齐：

| Area | Required path |
|------|---------------|
| Type | `src/core/types.ts` defines `ClueDefinition`, `ContentPool.clueDefinitions`, and `ContentPoolMutation.addClueDefinitions` |
| Zod schema | `src/core/schemas/content-pool.ts` defines `ClueDefinitionSchema`; `src/core/schemas/index.ts` exports it |
| YAML domain | `src/core/content-pool-loader.ts` maps `clueDefinitions` to `social-dialogue` in `DOMAIN_FIELDS` |
| Loader validation | `src/core/content-pool-loader.ts` validates `clueDefinitions` through `DOMAIN_SCHEMAS` |
| LLM tool | `src/llm/tools/content-pool-evolve.ts` exposes `add_clue_definition` |
| Tool-call parser | `src/llm/tool-mutations.ts` turns `add_clue_definition` into `ContentPoolMutation.addClueDefinitions` |
| Evolve prompt | `src/llm/prompts/content-pool-evolve.ts` documents how clue definitions are generated |
| Materializer | `src/simulation/content-pool-materializer.ts` applies `addClueDefinitions`, updating existing clues by `id` |
| Evolve write-back | `src/core/content-pool-loader.ts` writes `clueDefinitions` to `content-pool/evolve/social-dialogue.yaml` |
| Base YAML | `worlds/content-pool/social-dialogue.yaml` stores hand-authored clue definitions |
| Boundary guard | `.dependency-cruiser.js` keeps runtime features away from raw ContentPool loader/schema/tooling imports |
| Tests | loader, schema, tool parser, dispatcher tool exposure, materializer, write-back, reload, and dependency boundary tests cover the chain |

如果上述任一环缺失，应先补 ContentPool 链路，再实现游记读取。不要在 `travelogue-generator.ts` 中创建 clue fallback 数据。

### Reads
| pool field | Where | Purpose |
|------------|-------|---------|
| `clueDefinitions` | `buildTraveloguePrompt` | 将 `clueId` 解析为 `description` 文本 |

### No new fields needed
复用 `clue-system` 已添加的 `ContentPool.clueDefinitions`。

## Today Clue Boundary

不要从 `events[0].tick` 推断当天起点。`world.eventLog` 不按天清空，事件列表里可能包含旧事件。

本变更把"今日线索"定义为：玩家上一条游记生成之后、当前游记生成之前获得的线索。

计算规则：
- `lastTravelogueTick = player.travelogue.at(-1)?.createdAt`
- 如果存在上一条游记，包含 `knownClue.learnedAt > lastTravelogueTick && knownClue.learnedAt <= world.tick`
- 如果不存在上一条游记，包含 `knownClue.learnedAt <= world.tick`

这样游记生成前后各有一个明确边界，不依赖事件日志是否保留旧数据。

## State Mutation Path

此变更**不新增状态写入路径**。只读取：
- `player.knownClues` (已有，由 clue-system 写入)
- `pool.clueDefinitions` (ContentPool，YAML 定义)
- `world.entities` (查 NPC 名)

`TravelogueEntry` 写入走现有路径：`round-engine.ts` → `(player as PlayerEntity).travelogue.push(entry)`。

缺失的 `clueDefinition` 不应使用兜底文本。实现应跳过该条线索，并通过测试覆盖，避免把 ContentPool 数据缺口隐藏进游记文本。

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| `travelogue-generator.ts` | no-hardcoded-labels | ✅ 不新增映射表 |
| `travelogue-generator.ts` | no-direct-world-mutation | ✅ 只读操作 |
| `travelogue-generator.ts` | no-create-default-outside-world | ✅ 无新默认值 |
| `travelogue-generator.ts` | no-hardcoded-description-text | ✅ 文本来自 ContentPool |

## Test Plan

### ContentPool 链路测试
- `src/__tests__/content-pool-loader.test.ts`: 测试 `social-dialogue.yaml` 可加载 `clueDefinitions`
- `src/__tests__/content-pool-loader.test.ts`: 测试无效 `clueDefinitions` schema 会加载失败
- `src/__tests__/content-pool-loader.test.ts`: 测试 `writeEvolveDeltas()` 将 `addClueDefinitions` 写入 `evolve/social-dialogue.yaml`
- `src/__tests__/content-pool-loader.test.ts`: 测试 evolve 写回后重新加载仍保留 clueDefinitions
- `src/__tests__/llm-tool-mutations.test.ts`: 测试 `add_clue_definition` tool call 解析为 `addClueDefinitions`
- `src/__tests__/llm-dispatcher.test.ts`: 测试 ContentPool evolution 调用时暴露 `add_clue_definition` tool
- `src/__tests__/content-pool-materializer.test.ts`: 测试 `addClueDefinitions` 新增和按 `id` 更新
- `npx depcruise src --config .dependency-cruiser.js`: 验证没有新增 ContentPool 边界违规

### 新增测试
- `src/__tests__/travelogue-generator.test.ts`: 测试有线索时 prompt 包含"今日获悉的线索"段落；无线索时不注入
- `src/__tests__/travelogue-generator.test.ts`: 测试只包含上一条游记之后获得的线索，不包含更早线索
- `src/__tests__/travelogue-generator.test.ts`: 测试缺失 `clueDefinition` 时跳过该线索，不生成兜底文案

### 避免破坏的现有测试
- `travelogue-generator.test.ts` 现有测试（`player.knownClues` 为空数组 → 无线索上下文，行为不变）
