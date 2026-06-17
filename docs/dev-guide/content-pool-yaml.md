---
name: content-pool-yaml
description: >
  YAML 内容池维护指南：文件位置、加载顺序、格式规范、domain 字段映射。
  Use for: editing YAML content pool files, domain mapping, content pool data format.
---

# YAML 内容池维护指南

## 文件位置

```
worlds/<world>/
  content-pool/
    needs-actions.yaml      # 需求定义 + 行为效果 + 需求→行为映射
    schedules.yaml           # 角色日程模板
    social-dialogue.yaml     # 对话效果 + 社会涟漪 + 情绪标签
    culture-narrative.yaml   # 命名池 + 叙事模板 + 日历
    room-templates.yaml      # 房间模板
    triggers.yaml            # LLM 触发频率配置
    terrain.yaml             # 地形配置
    combat.yaml              # 战斗配置 + 战斗技能
    entity-actions.yaml        # 房间 tag → 可用动作 + 显示标签
    quests.yaml              # 任务模板
    time-environment.yaml    # 昼夜、季节、天气、保暖舒适参数
    evolve/                  # LLM 自动演化（勿手动编辑）
```

## 加载顺序

三层合并，后层覆盖前层：

1. **代码兜底** — `createDefaultContentPool()` 提供硬编码默认值
2. **base YAML** — `content-pool/*.yaml` 设计师手写数据
3. **evolve YAML** — `content-pool/evolve/*.yaml` LLM 演化数据

## 域文件一览

| 文件名 | ContentPool 字段 | 用途 |
|--------|-----------------|------|
| `needs-actions.yaml` | needDefinitions, actionEffects, needActionMap | 需求衰减、行为对需求的影响、哪些行为满足哪些需求 |
| `schedules.yaml` | scheduleTemplates, behaviorAtoms | 每种角色的日程序 |
| `social-dialogue.yaml` | dialogueEffectMapping, socialRippleConfig, emotionLabels, needLabels, traitLabels, itemPropertyLabels, narrativeTemplates | 对话效果查表、涟漪传播参数、情绪/需求/特质标签、叙事模板 |
| `culture-narrative.yaml` | namePools, narrativeTemplates, calendar | 命名池、叙事模板、日历系统 |
| `room-templates.yaml` | roomTemplates | 房间模板（规则降级 / LLM 参考） |
| `triggers.yaml` | llmTriggerConfig | LLM 触发频率 |
| `terrain.yaml` | terrainConfig | 地形类型 → 移动消耗 / 速度 / 危险度 |
| `combat.yaml` | combatConfig, combatSkills | 战斗公式参数、NPC 主动攻击阈值、战斗技能 |
| `entity-actions.yaml` | entityActionsByTag, entityActionLabels, entityTagLabels | 房间标签对应的场景动作和显示文本 |
| `quests.yaml` | questTemplates | 任务模板、目标、奖励、触发条件 |
| `storyline.yaml` | storylineConfig | 剧情配置（事件回溯窗口） |
| `time-environment.yaml` | dayNightConfig, seasonConfig, weatherConfig, warmthComfortConfig | 昼夜时段、季节映射、天气池、保暖舒适参数 |

## 修改 ContentPool 字段

先判断本次改动是哪一种：

| 改动类型 | 必须同步 |
|----------|----------|
| 只改 YAML 内容 | YAML 文件、对应 loader 测试或消费者测试 |
| 新增字段 | `ContentPool` 类型、schema、loader domain、默认值、base YAML、消费者代码、测试 |
| LLM 可写字段 | 新增字段全部内容 + mutation、materializer、写回、prompt/tool、演化测试 |
| 引擎约定 | 不进 ContentPool；在代码附近说明为什么这是协议或引擎规则 |

详细闭环以 `docs/06-content-pool.md` 的“生命周期优先级建议”为准。这里不要另写一份不同的 checklist，避免两个文档不一致。

## 添加新条目

### 加一种新需求

在 `needs-actions.yaml` 的 `needDefinitions` 数组末尾追加：

```yaml
  - type: curiosity
    baseUrgency: 0.3
    decayRate: 4
    description: 对新奇事物的渴望
    bornFrom: baseline
```

同时在 `needActionMap` 中添加对应映射：

```yaml
  - needType: curiosity
    actionNames: [explore, read_book]
```

### 加一种新地形

在 `terrain.yaml` 的 `terrainConfig` 数组末尾追加：

```yaml
  - terrain: lava
    baseCost: 8
    speedMod: 0.2
    danger: 9
    requires: [fire_resistance]
```

### 加一种新行为效果

在 `needs-actions.yaml` 的 `actionEffects` 数组末尾追加：

```yaml
  - action: explore
    needDeltas: { curiosity: 20, rest: -10 }
```

### 加一种房间动作

先确认动作效果已经在 `needs-actions.yaml` 的 `actionEffects` 中存在，再把它挂到房间 tag：

```yaml
entityActionsByTag:
  forest:
    - forage

entityActionLabels:
  forage: 采集

entityTagLabels:
  forest: 林地
```

### 调整战斗参数

在 `combat.yaml` 中修改 `combatConfig`。NPC 主动攻击阈值、攻击冷却、基础攻击、防御、逃跑概率等都应从这里读取，不要在战斗代码里新写数值常量。

### 加任务模板

在 `quests.yaml` 的 `questTemplates` 中追加任务。任务字段结构较多，修改后至少跑：

```bash
npx vitest run src/__tests__/quest-tracker.test.ts src/__tests__/content-pool-loader.test.ts
```

## 格式校验

加载时自动过 schema，格式错误会记 warn 并跳过该条目，不阻塞启动。

日志中查找 `[SchemaValidator]` 或 `[ContentPoolLoader]` 确认校验结果。

### 常见错误

- 字段名拼写错误（如 `baseUrgency` 写成 `baseurgency`）
- 数组用 `{}` 包裹（应为 `- item` 格式）
- 枚举值不合法（如 terrain 写成 `lava_flow` 而非已注册的枚举值）
- 缩进层级不对（YAML 用 2 空格缩进）

## 禁止操作

- **不要手动编辑 `evolve/` 下的文件** — 这些文件由 LLM 演化管道自动写回
- **不要在 YAML 中嵌入逻辑** — 内容池是声明式数据，逻辑在引擎代码中
- **不要绕过 schema 裸写数据** — 格式错误会在加载时被拦截
- **不要只改 prompt 或工具定义** — LLM 可写字段必须能运行时应用并写回 YAML
