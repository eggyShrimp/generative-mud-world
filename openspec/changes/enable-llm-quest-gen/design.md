# Design: enable-llm-quest-gen

## Data Flow

```
[content_pool_evolve trigger on checkDay]
  │
  ├─► dispatcher.ts: 从 world 构建 context
  │     · world.entities (NPCs)    → existingNpcs[]
  │     · world.rooms + regions    → existingRooms[]
  │     · pool.questTemplates      → existingQuests[]
  │     · pool.itemTemplates       → existingItemTemplates[]
  │     · pool.clueDefinitions     → existingClues[]
  │     · pool.calendar.eraName    → era (existing)
  │
  ├─► buildContentPoolEvolvePrompt(context)
  │     · System prompt: 任务生成核心规则 + 反模式清单 + 优质/劣质示例
  │     · User message: JSON context + NPC/房间/任务/物品/线索列表
  │
  ├─► LLM chat(system, user, CONTENT_POOL_EVOLVE_TOOLS)
  │     · TOOLS 中包含 ADD_QUEST_TEMPLATE_TOOL
  │     · LLM 可调用 add_quest_template(name, args)
  │
  ├─► contentPoolMutationFromToolCalls(response.toolCalls)
  │     · case "add_quest_template":
  │     ·   QuestTemplateSchema.safeParse(args)
  │     ·   → mutation.addQuestTemplates.push(...)
  │
  └─► [Output / State Change]
        · content-pool-materializer.ts:
            pool.questTemplates.push() or Object.assign() (upsert)
        · content-pool-loader.ts:
            持久化到 worlds/content-pool/evolve/quests.yaml
```

## ContentPool Integration

### Consumed (read-only)

| pool field | Usage |
|-----------|-------|
| `pool.questTemplates` | 提取 `{id, title}` 摘要，传至 LLM 避免重复生成已有任务 |
| `pool.itemTemplates` | 提取 `{id, name}` 摘要，供 LLM 选择奖励物品时引用真实 ID |
| `pool.clueDefinitions` | 提取 `{id, description}` 摘要，供 LLM 引用为任务信息锚点 |
| `pool.calendar.eraName` | 作为时代上下文（existing） |
| `pool.needDefinitions` | 需求类型列表（existing） |
| `pool.traitLabels` | 特质标签 keys（existing） |
| `pool.actionEffects` | 行为标识列表（existing） |
| `pool.scheduleTemplates` | 角色标识列表（existing） |
| `pool.roomTemplates` | 文化标识列表（existing） |

### Modified (write path)

| pool field | Materializer |
|-----------|-------------|
| `pool.questTemplates` | `content-pool-materializer.ts:152-162` — push 新任务或 Object.assign 更新已有任务 |

No new ContentPool fields required.

## State Mutation Path

**World state (`pool.questTemplates`)** 通过 ContentPool 写入路径修改：

1. LLM 产出 `ContentPoolMutation.addQuestTemplates: QuestTemplate[]`
2. `content-pool-materializer.ts` applyMutation() 调用：
   - 若 `q.id` 已存在 → `Object.assign(exists, q)` 原地更新
   - 否则 → `pool.questTemplates.push(q)` 追加
3. `content-pool-loader.ts` persist() 将 `questTemplates` 写入 `evolve/quests.yaml`

此路径是已有的 ContentPool 写入机制，无直接世界状态 mutation。任务的运行时效果（activeQuest 等）由 quest-tracker 和 storyline-engine 通过 delta pipeline 管理，不在此变更范围内。

## Trap Token Verification

| File | Trap Checked | Status |
|------|-------------|--------|
| `src/llm/tools/content-pool-evolve.ts` | no-hardcoded-labels | ✅ 无新增 `Record<string,string>` 映射 |
| `src/llm/tools/content-pool-evolve.ts` | no-direct-world-mutation | ✅ tool definition 是 JSON Schema，不操作 state |
| `src/llm/prompts/content-pool-evolve.ts` | no-create-default-outside-world | ✅ prompt 是纯字符串构建，不调用 createDefaultXxx |
| `src/llm/prompts/content-pool-evolve.ts` | no-hardcoded-description-text | ✅ 示例按 AGENTS.md 要求生成，可理解 |
| `src/llm/dispatcher.ts` | no-direct-world-mutation | ✅ 只读遍历 `world.entities/world.rooms/pool.*`，构建 context |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/llm-dispatcher.test.ts` | `content_pool_evolve` 触发时 context 包含世界状态 | `context.existingNpcs` 含 NPC id/name/room；`context.existingRooms` 含房间 id/name/region/tags；`context.existingQuests` 含 quest id/title；`context.existingItemTemplates` 含物品 id/name；`context.existingClues` 含线索 id/description |
| `src/__tests__/quest-tracker.test.ts` | `quest_mogao_cipher` 全流程 | talk→explore→talk 推进 + complete + traits/relation/item rewards 验证（已实现） |

## Manual Checks

- [ ] 启动游戏 → 推进到 `checkDay`（默认第 1 天）→ 触发 `content_pool_evolve` → 检查 LLM 输出的 tool call 或 JSON 中是否包含 `add_quest_template` 调用
- [ ] 检查生成的任务是否：引用真实 NPC/房间 ID、包含混合目标类型（非纯 talk）、描述有因果链、奖励与叙事挂钩
- [ ] 检查 `evolve/quests.yaml` 是否生成且可被 `content-pool-loader` 加载
