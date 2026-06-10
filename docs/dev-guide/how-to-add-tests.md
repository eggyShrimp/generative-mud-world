---
name: how-to-add-tests
description: >
  添加测试的操作流程、常用模式和覆盖验证方法（Vitest）。
  Use for: adding tests, test patterns, coverage verification, Vitest usage.
---

# 如何添加测试

本项目使用 Vitest，测试文件在 `src/__tests__/`。本文档提供添加测试的操作流程、常用模式和覆盖验证方法。

> 规范参考：`testing.md`（命名、运行命令、期望）

---

## 1. 选什么类型的测试

```
你要测的函数/模块有外部 I/O（文件、网络）？
├─ 否 → 单元测试
│   └─ 测的是 zod schema？ → Schema 验证测试
└─ 是 → 集成测试（临时目录/模拟网络）
```

**选型判断**：
- 单元测试：纯函数、状态计算、delta 合并、路径规划等
- Schema 验证测试：`src/core/schemas/` 里的 zod 定义
- 集成测试：ContentPool 加载/持久化、YAML 读写、WebSocket 协议

---

## 2. 单元测试 — Step by Step

### 2.1 创建文件

```bash
# 文件名与源文件对应，放在 src/__tests__/
# 源: src/simulation/index.ts → 测试: src/__tests__/simulation.test.ts
```

### 2.2 测试文件骨架

```ts
import { describe, expect, it } from "vitest"
import { theFunction } from "../path/to/module.ts"

describe("模块名", () => {
  it("方法名: 场景描述 → 预期行为", () => {
    const result = theFunction(input)
    expect(result).toBe(expected)
  })
})
```

### 2.3 构造测试数据

**优先用 `createDefaultContentPool()`**，不要加载真实 YAML：

```ts
import { createDefaultContentPool } from "../core/world.ts"

it("should process default pool", () => {
  const pool = createDefaultContentPool()
  expect(pool.needDefinitions).toHaveLength(5)
})
```

**构造 NPC / 世界**：

```ts
import {
  addEntity, addRegion, addRoom,
  createNPC, createPlayer, createRoom, createWorld,
} from "../core/world.ts"

function setupWorld() {
  const world = createWorld()
  addRegion(world, {
    id: "test", name: "test",
    dominantCulture: "test", prosperity: 50, threatLevel: 10,
  })
  const room = createRoom("tavern", "酒馆", "test", "昏暗的酒馆")
  addRoom(world, room)
  return world
}
```

### 2.4 正向 + 反向用例

每个 mutation/transform 函数至少覆盖：
- **正向**：正常输入 → 期望结果
- **反向**：空输入 / 重复输入 / 边界值

```ts
describe("applyDelta", () => {
  it("正向: valid delta 应更新 need 值", () => {
    // ...
  })

  it("反向: 不存在的 entityId 应静默忽略", () => {
    // ...
  })
})
```

### 2.5 Mock LLM

不要 mock 整个模块，用 `vi.fn()` 构造 fake adapter：

```ts
import { vi } from "vitest"
import type { LLMAdapter } from "../llm/adapter.ts"

function mockAdapter(responseText: string, toolCalls?: Array<...>) {
  return {
    chat: vi.fn().mockResolvedValue({ text: responseText, toolCalls }),
    generate: vi.fn().mockResolvedValue({ text: responseText, toolCalls }),
  } as unknown as LLMAdapter
}
```

用 `vi.spyOn()` 拦截真实对象的特定方法（保留构造函数逻辑）：

```ts
const dispatcher = new InteractionDispatcher(stubAdapter())
vi.spyOn(dispatcher, "checkReachable").mockResolvedValue(false)
```

Mock 响应数据放在 `src/__tests__/fixtures/llm-responses.ts`，保持与 prompt schema 同步。

---

## 3. Schema 验证测试

测试 `src/core/schemas/` 里的 zod 定义。

```ts
import { describe, expect, it } from "vitest"
import { QuestTemplateSchema } from "../core/schemas/content-pool.ts"

describe("QuestTemplateSchema", () => {
  it("正向: 完整数据应通过校验", () => {
    const result = QuestTemplateSchema.safeParse({
      id: "q1",
      title: "测试",
      description: "desc",
      giverNpcId: null,
      objectives: [],
      rewards: { exp: 10 },
      repeatable: false,
      deadlineDays: 5,
    })
    expect(result.success).toBe(true)
  })

  it("反向: 缺少必填字段应失败", () => {
    const result = QuestTemplateSchema.safeParse({ id: "q1" })
    expect(result.success).toBe(false)
  })

  it("反向: 类型错误应失败", () => {
    const result = QuestTemplateSchema.safeParse({
      id: 123, // 应为 string
      // ...
    })
    expect(result.success).toBe(false)
  })
})
```

---

## 4. 集成测试 — Step by Step

### 4.1 临时目录模式

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { parse as parseYaml } from "yaml"

const TEST_DIR = join(import.meta.dirname, "../../.test-你的模块名")

function cleanTestDir() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
}

beforeEach(cleanTestDir)
afterEach(cleanTestDir)
```

### 4.2 写入 → 操作 → 验证模式

```ts
it("should persist and reload", () => {
  const poolDir = join(TEST_DIR, "content-pool")
  mkdirSync(poolDir, { recursive: true })

  // 写入测试 YAML
  writeFileSync(join(poolDir, "test.yaml"), yamlContent, "utf-8")

  // 操作
  const pool = loadContentPoolFromDir(poolDir)

  // 验证
  expect(pool.someField).toBe(expectedValue)
})
```

### 4.3 覆盖路由分支（domain 路由为例）

当函数内部有多条路由分支时（如 `writeEvolveDeltas` 的 domain 路由），逐条覆盖：

```
ContentPoolMutation 字段 → domain → YAML 文件
addNeedDefinitions        → needs-actions → evolve/needs-actions.yaml
addScheduleTemplates      → schedules     → evolve/schedules.yaml
replaceNeedLabels         → social-dialogue → evolve/social-dialogue.yaml
...
```

**策略**：每个 domain 至少一个测试，覆盖"单字段触发"和"多字段同时触发"两种场景。

---

## 5. 验证覆盖完整

### 5.1 字段→路由→测试 对照表

对需要路由的函数，列出所有输入字段，标记是否有测试覆盖：

```bash
# 列出 mutation 字段
grep -n "mutation\." src/core/content-pool-loader.ts | grep -v "//"

# 列出已有测试覆盖的字段
grep -n "mutation:" src/__tests__/content-pool-loader.test.ts
```

对照后逐条补测。

### 5.2 分支覆盖

```bash
# 查看条件分支
grep -n "if (" src/path/to/module.ts

# 查看测试覆盖的场景
grep -n "it(" src/__tests__/module.test.ts
```

### 5.3 运行单个文件快速验证

```bash
npx vitest run src/__tests__/你的文件.test.ts
```

---

## 6. 常见反模式

| 反模式 | 问题 | 正确做法 |
|--------|------|---------|
| 只写正向用例 | 边界输入未覆盖 | 每个函数至少 1 正向 + 1 反向 |
| 测试数据硬编码 | ContentPool 变了测试就挂 | 用 `createDefaultContentPool()` 作基底 |
| 从 YAML 加载测试数据 | YAML 路径假设、文件不存在 | 单元测试用 inline 构造 |
| Mock 整个模块 | 跳过了真实的构造函数逻辑 | 用 `vi.spyOn()` 拦截特定方法 |
| 测试名不描述场景 | 测试失败时不知道测什么 | `方法名: 场景 → 预期行为` |
| 不清理临时文件 | `.test-*` 目录残留 | `beforeEach`/`afterEach` 清理 |
| 忽略 `null`/`undefined` 输入 | 空值路径未覆盖 | 专门写"空输入"用例 |
| 多个 `it` 共享可变状态 | 测试顺序依赖 | 每个 `it` 独立构造，不依赖前一个 |

---

## 7. Checklist（新模块/新功能）

- [ ] 测试文件已创建：`src/__tests__/<模块名>.test.ts`
- [ ] 正向用例：正常输入 → 期望结果
- [ ] 反向用例：空输入 / 不存在的 key / 重复输入
- [ ] Mock 方式：`vi.spyOn()` 拦截特定方法，非整模块 mock
- [ ] 测试数据：`createDefaultContentPool()` 作基底，不加载真实 YAML
- [ ] 临时目录：`beforeEach`/`afterEach` 清理
- [ ] 运行 `npx vitest run src/__tests__/<模块名>.test.ts` 通过
- [ ] 运行 `npx vitest run` 全量通过（无回归）
