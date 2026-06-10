---
name: testing
description: >
  测试规范：运行命令、文件命名、单元测试和组件测试写法。
  Use for: writing tests, running tests, test file organization, vitest.
---

# 测试

## 运行

```bash
# 全量测试
npx vitest run

# 单个测试文件
npx vitest run src/__tests__/content-pool-loader.test.ts

# 监听模式
npx vitest watch
```

## 文件规范

| 规范 | 说明 |
|------|------|
| 位置 | `src/__tests__/*.test.ts` |
| 命名 | `<模块名>.test.ts`，与源文件对应 |
| 每模块一个文件 | `content-pool-loader.test.ts` 测试 `content-pool-loader.ts` |

## 测试类型

### 单元测试

不依赖外部文件系统，直接调用函数验证逻辑：

```ts
import { createDefaultContentPool } from "../core/world.ts"

it("should return default needDefinitions", () => {
  const pool = createDefaultContentPool()
  expect(pool.needDefinitions).toHaveLength(5)
})
```

### 集成测试

涉及 YAML 文件读写，使用临时目录：

```ts
const TEST_DIR = join(import.meta.dirname, "../../.test-content-pool")

function cleanTestDir() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
}

beforeEach(cleanTestDir)
afterEach(cleanTestDir)

it("should load from YAML", () => {
  const poolDir = join(TEST_DIR, "content-pool")
  mkdirSync(poolDir, { recursive: true })
  writeFileSync(join(poolDir, "test.yaml"), "...")
  const pool = loadContentPoolFromDir(poolDir)
  expect(pool.xxx).toBe(...)
})
```

## 命名

```ts
describe("模块名", () => {
  it("方法名: 场景描述 → 预期行为", () => {
    // ...
  })
})
```

## 期望

- 新模块必须有测试覆盖
- 每个 mutation/transform 函数至少 1 个正向 + 1 个反向用例
- 测试数据优先使用 `createDefaultContentPool()` 而非真实 YAML 加载
