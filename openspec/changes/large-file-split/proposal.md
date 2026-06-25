# Proposal: large-file-split

## Why

5 个引擎源文件超千行（合计 7934 行），每个文件混杂 3-10 种不相关职责，导致：

- 新增功能时需要在一千多行的文件中定位修改点，容易改错
- 代码审查无法聚焦，diff 横跨几百行不相关的逻辑块
- 测试粒度被迫粗放，必须加载整个模块才能测试一个工具函数
- `dialogue-generator.ts` (2359 行) 和 `command-executor.ts` (1685 行) 尤其严重，前者是 God class，后者是巨型 switch

工程债务已列入 `engineering-quality-p3-p4` 的 P3 项，本次单独拆出作为独立 refactor change 实现。

## Change Type

**engine-logic** — Core/engine/simulation/llm/server 维护性重构。

refactor

## What Changes

- `src/core/world.ts` (1765行)：按职责拆为 7 个模块，壳文件保持所有 export 不变
- `src/engine/command-executor.ts` (1685行)：按命令类别拆为 10 个模块，`executeCommand` 壳 switch 转发
- `src/llm/dialogue-generator.ts` (2359行)：按交互类型拆为 13 个模块，class 壳保留 6 个 public 方法签名
- `src/server/ws-server.ts` (1085行)：按职责拆为 6 个模块，`GameServer` class 壳保留，内部方法体抽为自由函数
- `src/core/types.ts` (1040行)：按领域拆为 10 个类型文件 + 1 个 barrel `index.ts`

**注意**：`src/tui/client/game-client.ts` (876行) 的拆分属于 `world-tui` schema，在独立 change `large-file-split-tui` 中实现。

## Modules Touched

| 文件 | 当前行数 | Change Type | Description |
|------|----------|-------------|-------------|
| `src/core/world.ts` | 1765 | split-to-7 | 拆为 defaults / entity-ops / room-region / event-log / time-weather / delta-application / factories + world.ts 壳 |
| `src/engine/command-executor.ts` | 1685 | split-to-10 | 拆为 helpers / feasibility / move / social / inventory / combat / equipment / day-cycle / room-actions / utility + command-executor.ts 壳 |
| `src/llm/dialogue-generator.ts` | 2359 | split-to-13 | 拆为 context-builders / prompt-builders / tool-processing / conversation-history / follow-up / conversation-menu / fixed-menu / quest-dialogue / idle-chat / trade / functional-dialogue / menu-transition / helpers + 类壳 |
| `src/server/ws-server.ts` | 1085 | split-to-6 | 拆为 minimap / server-helpers / session-manager / state-pusher / message-handler / ws-server.ts 壳 |
| `src/core/types.ts` | 1040 | split-to-10 | 拆为 entity / world-room / delta / environment / quest-storyline / content-pool / llm-config / daily-report / save / schedule + types/index.ts barrel |

**对外公共 API 在拆分过程中保持不变。** 所有 consumer 无需修改。

## ContentPool Reads

无新增 ContentPool 读取。拆分是纯代码搬家，不引入新逻辑。

| pool.xxx field | Used in (file) | Purpose |
|----------------|----------------|---------|
| — | — | — |

## Trap Token Self-Check

| Trap | Applies? | How Addressed |
|------|:--:|---------------|
| no-hardcoded-labels (new Record<string,string>) | no | 不新增映射表或标签 |
| no-direct-world-mutation (push/assign to state) | no | 不修改世界状态 |
| no-create-default-outside-world | no | 不新建 default 构造调用 |
| no-hardcoded-description-text (Chinese in engine/combat) | no | 只搬代码，不改字符串 |
| no-empty-catch | no | 不修改 try/catch 块 |

## Impact

- 每个大文件缩减至 50-200 行（壳 + 转发调用），新文件各 50-500 行
- 壳文件保持原 public export 接口不变，consumer 无感
- 依赖关系清晰化：先把被依赖最多的公共工具函数抽出来，再抽各领域模块
- 零行为变化：所有拆分为纯代码原位迁移

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/world.test.ts` | 拆分后世界 CRUD、delta 应用行为不变 |
| `src/__tests__/engine.test.ts` | 拆分后命令执行、可行性检查行为不变 |
| `src/__tests__/dialogue-generator.test.ts` | 拆分后对话生成行为不变 |
| `src/__tests__/ws-server.test.ts` | 拆分后 WS 服务器行为不变 |
| 全部现有测试 | 拆分后所有 969 tests 通过 = 无回归 |
