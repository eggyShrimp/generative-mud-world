# Proposal: day-night-season-weather-yaml

## Why

昼夜时段、季节和天气属于世界设定数据：它们有标签、叙事描述、月份映射、可见度和移动系数，都会影响 LLM 叙事和规则读取。为了避免引擎里长出硬编码表，这些值必须放在 ContentPool，并通过 YAML、schema、loader、LLM 演化和写回链路维护。

## Change Type

**yaml-data** — ContentPool field / YAML data change. No engine logic. No TUI.

## What Changes

- 新增 `dayNightConfig`，定义时段、开始小时、标签和可见度系数。
- 新增 `seasonConfig`，定义季节、月份映射、标签、需求衰减系数、舒适温度和叙事前缀。
- 新增 `weatherConfig`，定义天气类型、季节可用性、权重、移动和可见度系数、叙事描述。
- 新增 `warmthComfortConfig`，定义保暖舒适公式的平衡参数。
- 扩展 `actionEffects`，为需要消耗世界时间的行动声明 `durationMinutes`，避免引擎用固定 1 小时或本地动作表推断耗时。
- 四个字段都走完整 ContentPool 链路：类型、schema、loader、默认值、YAML、LLM tool、parser、materializer、write-back、reload 测试。

## ContentPool Fields

### Added

| Field | Type | Domain | LLM-Evolvable? | Reason |
|-------|------|--------|----------------|--------|
| `dayNightConfig` | `DayNightConfig` | `time-environment` | yes | mod 和 LLM 可调整时段边界与显示标签 |
| `seasonConfig` | `SeasonConfig` | `time-environment` | yes | mod 和 LLM 可调整月份映射、季节叙事、舒适温度和衰减系数 |
| `weatherConfig` | `WeatherConfig` | `time-environment` | yes | mod 和 LLM 可调整天气池、权重和环境影响 |
| `warmthComfortConfig` | `WarmthComfortConfig` | `time-environment` | yes | mod 和 LLM 可调整保暖公式参数，不让数值藏在引擎里 |

### Modified

| Field | Reason | Breaking? |
|-------|--------|:--:|
| `actionEffects[].durationMinutes` | 行动耗时属于世界/规则数据；不同世界可以让交谈、采集、旅行、工作有不同耗时 | no |

## Consumer Analysis

Before implementation, run:

```bash
rg "dayNightConfig|seasonConfig|weatherConfig|warmthComfortConfig" src/ --type ts | grep -v __tests__ | grep -v "\.d\.ts"
```

Expected initial output is empty before fields are added. After the companion engine change, expected consumers are:

| Field | Consumer |
|-------|----------|
| `dayNightConfig` | `src/core/world.ts`, `src/combat/pulse.ts`, `src/core/round-engine.ts`, `src/engine/command-executor.ts` |
| `seasonConfig` | `src/core/world.ts`, `src/simulation/index.ts`, `src/core/round-engine.ts`, `src/simulation/storyline-engine.ts`, `src/engine/command-executor.ts` |
| `weatherConfig` | `src/core/world.ts` |
| `warmthComfortConfig` | `src/simulation/index.ts` |
| `actionEffects[].durationMinutes` | `src/engine/command-executor.ts`, `src/core/round-engine.ts` |

## ContentPool Maintenance Path

| Area | Applies? | Notes |
|------|:--:|-------|
| Type + mutation type | yes | Add field types and `replaceDayNightConfig`, `replaceSeasonConfig`, `replaceWeatherConfig`, `replaceWarmthComfortConfig` |
| Zod schema + export | yes | Validate bounds, required labels, weights, multipliers |
| YAML domain + loader schema | yes | New `time-environment.yaml` domain |
| LLM tool | yes | Replace whole configs through structured tools |
| Tool-call parser | yes | Tool calls become `ContentPoolMutation` fields |
| Evolve prompt | yes | Explain when the LLM may adjust time/environment config |
| Materializer | yes | Apply replacement configs in memory |
| Evolve write-back | yes | Persist replacements under evolve YAML |
| Boundary constraints | yes | Prevent duplicate runtime hardcoded maps |
| Chain tests | yes | Loader, schema, tools, parser, materializer, write-back, reload |

## Impact

- ContentPool interface: yes
- Zod schemas: yes
- ContentPool loader: yes
- LLM tool definitions: yes
- LLM tool-call parser: yes
- ContentPool materializer: yes
- Evolve write-back: yes
- YAML data files: yes
- LLM prompts: yes
- dependency-cruiser constraints: no new rule expected; trap-token checks apply
- Consumer code: engine companion change reads the fields
