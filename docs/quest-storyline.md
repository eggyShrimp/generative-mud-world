---
name: quest-storyline
description: >
  任务与剧情系统：设计理念、共享基础设施、本质区别、设计原则、关键权衡、LLM 角色定位。
  Use for: quest system, storyline design, narrative architecture, LLM role in quests.
---

# 07 — 任务与剧情系统：设计理念

> 与 `docs/tmp/storyline-design.md`（实施手册）互补——本文解释"为什么这样设计"，那篇解释"怎么实现"。

---

## 1. 问题定义

任务（Quest）和剧情（Storyline）解决两个不同的问题：

- **任务**给玩家方向感和奖励回路——"我该做什么？做完了有什么好处？"
- **剧情**给世界注入叙事脉络——"这个世界在发生什么？我参与其中会怎样？"

两者都需要追踪玩家行为、判定条件、发放奖励。但触发方式、结构复杂度、叙事深度完全不同。设计的核心挑战是：**让两个截然不同的系统共享一套基础设施，同时不丢失各自的本质特征。**

---

## 2. 共享基础设施的哲学

### 接口归一，数据分流

任务和剧情共享四层抽象：

| 层 | 任务 | 剧情 | 共享方式 |
|----|------|------|---------|
| 目标 | `QuestObjective` | `Objective` (stage) | 同一个 `Objective` 接口 |
| 效果 | `QuestReward` | `Effect` (onComplete) | 同一个 `Effect` 接口 |
| 进度 | `QuestState.objectiveProgress` | `StorylineState.objectiveProgress` | 同一个检查函数 |
| 管道 | `SimulationDelta.questChanges` | `SimulationDelta.storylineChanges` | 同一个 `applyDelta()` |

**为什么这样做**：如果任务和剧情各自实现一套目标检查、效果应用、进度追踪，代码必然重复，行为必然分叉。共享接口意味着：
- 增加新的目标类型（如 `defeat_npc`）只需改一处，两系统同时受益
- 效果应用管道（trait 变化、物品发放、关系调整）统一走 `applyDelta()`，不出现"任务奖励直接改属性、剧情奖励走 delta"的分裂
- 测试覆盖一处等于覆盖两处

### 为什么不用继承

任务不是剧情的特例，剧情也不是任务的泛化。它们是两个独立概念，共享部分实现。继承会强制一方适应另一方的生命周期，而两者生命周期完全不同：

- 任务：NPC 给予 → 接受 → 完成/失败 → 结束
- 剧情：条件触发 → 多阶段推进 → 最终完成 → 进入世界历史

接口共享 + 独立生命周期 = 正确的抽象层次。

---

## 3. Quest vs Storyline：本质区别

| 维度 | 任务 (Quest) | 剧情 (Storyline) |
|------|-------------|-----------------|
| 触发 | NPC 对话 / 自动发现 | 世界状态条件自动触发 |
| 结构 | 单阶段，目标 AND/OR | 多阶段，顺序推进 |
| 截止日期 | 支持 | 不支持（剧情没有"过期"概念） |
| 放弃 | 支持（有惩罚） | 不支持（你不能"放弃"正在发生的历史） |
| 叙事来源 | 描述文本 | `narrativeGuide` → LLM 生成 |
| 设计意图 | 给玩家方向 | 给世界叙事 |

**关键设计决策**：

1. **任务可以自动发现**（`autoDiscover`），但剧情**必须自动触发**。任务的自动发现是"玩家在探索中偶然触发"，剧情的自动触发是"世界状态满足条件时剧情自动激活"——符合涌现哲学。

2. **剧情不支持放弃**。你不能选择"不参与正在发生的历史"。剧情是世界的一部分，不是玩家的待办事项。

3. **剧情多阶段顺序推进**。任务的 groupId AND/OR 提供了灵活的目标组合，但剧情的阶段是线性的——因为叙事需要节奏感和因果链，不能让玩家跳过中间阶段。

4. **剧情阶段完成触发 LLM 叙事**。`narrativeGuide` 是给 LLM 的叙事引导，不是直接展示给玩家的文本。LLM 根据引导生成符合当前世界状态的叙事——这是"LLM 作为内容造血器官"在剧情系统中的体现。

---

## 4. 设计原则

### 原则 1：规则引擎不可变

任务/剧情的所有判断逻辑（进度检查、完成判定、效果应用）都在规则引擎中，不调 LLM。LLM 只在以下场景介入：
- 生成新的任务/剧情模板（ContentPool 演化）
- 生成剧情阶段完成的叙事文本
- 在对话中调用 `offer_quest` tool

**为什么**：如果 LLM 决定"任务是否完成"，规则就不可预测，玩家就无法建立因果预期。MUD 的核心体验是"我做了 X，得到了 Y"——这要求因果链确定。

### 原则 2：实时进度检查

每次玩家命令执行后立即检查任务/剧情进度，不等到回合结算。

**为什么**：如果玩家收集了第 5 个药草但要等到回合结算才看到"任务完成"，体验断裂。即时反馈是 MUD 的生命线。

### 原则 3：树形前置条件

`QuestPrerequisite = string | { logic: "and" | "or"; conditions }` — 支持分支剧情链。

**为什么**：剧情线需要分叉。"完成任务 A 或任务 B"是常见设计。扁平的"完成任务列表"无法表达这种关系。树形结构是 AND/OR 逻辑的自然表达。

### 原则 4：groupId 目标分组

同组 = OR，跨组 = AND。

**为什么**：比 `completionCondition: "all" | "any"` 更灵活。任务"收集青蒿或茯苓"（同一组内 OR）和"收集草药 + 找到铁匠"（跨组 AND）可以自然组合。剧情的 `completionCondition: "all" | "any"` 保持简单——因为剧情阶段通常不需要复杂的组合逻辑。

### 原则 5：轻量 LLM 注入

对话 prompt 只注入任务摘要（id + 标题 + 描述），不注入完整模板。

**为什么**：LLM 需要知道"NPC 可以提供什么任务"来决定是否调用 `offer_quest`，但不需要知道所有目标细节——那些在 `applyDelta` 时由规则引擎处理。注入完整模板浪费 token，且可能导致 LLM 尝试"帮助"完成任务。

### 原则 6：MUD 惯例遵守

- 描述文本不暴露内部 ID
- 放弃有惩罚
- 任务有容量上限
- 物品有 `questItem` 标记（防止误卖/误丢）

**为什么**：MUD 玩家有明确的预期。暴露 ID 破坏沉浸感，无惩罚放弃破坏成就感，无容量上限导致囤积症。

---

## 5. 关键权衡

### 单人实例 vs 多人共享

**选择**：每个任务模板同一时间只能有一个玩家持有。

**理由**：简化设计。多人共享需要处理：
- 谁"拥有"任务进度？
- 如果一人放弃，其他人怎么办？
- 奖励如何分配？

这些问题在多人 MMO 中有成熟方案，但 MUD 框架 MVP 不需要。单人实例 = 简单的 first-come-first-served。

### 冷却追踪 (`questCooldowns`)

**选择**：用独立的 `Record<string, number>` 而不是改 `completedQuests` 的结构。

**理由**：`completedQuests: string[]` 有大量消费者。改成 `Record<string, { day: number }>` 需要同步修改所有读取它的地方。独立字段是侵入最小的方案。

### 放弃惩罚

**选择**：`abandonPenalty` 是可选的 `Effect`，不是必填。

**理由**：不是所有任务都值得惩罚。"你放弃了药草收集"——这是玩家的自由选择，不一定需要扣属性。惩罚应该由设计师根据任务重要性决定。

### minRelation 门槛

**选择**：在 `autoDiscover`、`accept`、`dialogue offer_quest` 三处都检查。

**理由**：三处是独立的触发路径。如果只在 `accept` 检查，LLM 可能在对话中绕过关系门槛。三处检查 = 纵深防御。

### 自动发现 vs NPC 对话

**选择**：两者并存，不是互斥。

**理由**：
- NPC 对话是经典 MUD 模式——"老马说：我需要你帮忙收集药草"
- 自动发现是涌现模式——"你走进矿洞，发现了一份被遗忘的委托信"

两种触发方式服务于不同的游戏设计目标。NPC 对话强调社交关系，自动发现强调探索奖励。

---

## 6. 数据流向

```
ContentPool YAML (quests.yaml / storylines.yaml)
  ↓ content-pool-loader.ts 加载 + zod 校验
ContentPool.questTemplates / ContentPool.storylines
  ↓
触发阶段
  ├─ 任务: NPC 对话 → offer_quest tool → questChanges.accept
  │        自动发现 → checkAutoDiscover() → questChanges.accept
  └─ 剧情: checkTrigger() → evaluateTrigger() → storylineChanges.activate
  ↓
SimulationDelta
  ↓ applyDelta()
PlayerEntity.activeQuests / activeStorylines 更新
  ↓
进度追踪 (每次命令后)
  ├─ 任务: checkQuestProgress() → 检查每个 objective
  └─ 剧情: checkProgress() → 检查当前 stage objectives
  ↓
判定完成
  ├─ 任务: groupCompleted.every(true) → questChanges.complete → 发放 rewards
  └─ 剧情: stage 完成 → advanceStage → 应用 onComplete → 最终完成 → completedStorylines
  ↓
协议推送 → TUI 展示 (QuestPanel)
```

**关键设计点**：所有变更都经过 `SimulationDelta` 管道。没有直接修改玩家属性的代码路径。这意味着：
- 所有变更有统一的日志记录
- 所有变更可以被回放/重放
- 所有变更可以被 `materializer.ts` 统一处理

---

## 7. LLM 的角色定位

对照框架核心哲学（"LLM 只当造血器官"），LLM 在任务/剧情系统中的角色严格受限：

| LLM 做什么 | LLM 不做什么 |
|-----------|-------------|
| 生成任务/剧情模板（`add_quest_template` / `add_storyline`） | 判定任务是否完成 |
| 在对话中调用 `offer_quest` tool | 决定任务是否触发（除了 tool 调用本身） |
| 生成剧情阶段完成的叙事文本 | 裁决多个剧情的优先级冲突 |
| 注入任务摘要到对话 prompt | 注入完整模板到 prompt |

**为什么这样设计**：如果 LLM 决定"任务是否完成"，规则就不可预测。如果 LLM 决定"剧情是否触发"，世界演化就不可控。LLM 的价值在于**创造内容**，不在于**裁决规则**。

**ContentPool 演化中的校验门**：LLM 生成的任务/剧情模板经过 `tool-mutations.ts` 的三重校验：
1. zod schema 校验（结构合法性）
2. ID 唯一性检查（不重复）
3. 引用完整性检查（targetId 必须引用已存在的 NPC/房间/物品）

通过校验 → 写入 `evolve/` YAML → 重启后加载。LLM 的产出是数据，不是代码。

---

## 8. 演化路径

任务/剧情模板随世界时代演化：

```
铁器时代 → content_pool_evolve 触发
  → LLM 生成新的 questTemplates（如"铁匠的试炼"）
  → zod 校验 + 引用完整性
  → 写入 evolve/quests.yaml
  → 下次加载时 ContentPool 包含新模板
  → 新模板可以被 NPC 对话引用 / 自动发现触发
```

**设计意图**：玩家重玩时，世界演化出不同的任务/剧情组合。不是随机生成——是基于世界状态的确定性演化（检测阶段由规则控制），但生成内容有 LLM 的随机性。这是"规则确定性 + 内容多样性"的平衡。
