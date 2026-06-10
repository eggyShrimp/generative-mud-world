---
name: modification-workflow
description: >
  代码修改工作流：修改前必须执行的三步强制流程。
  Use for: before making changes, modification workflow, change process.
---

# 代码修改工作流

任何修改开始前，按以下三步执行。这是从多次双源维护 bug 中总结出的强制流程。

---

## 步骤 1：确定你改的是什么类型

| 修改类型 | 判断依据 | 后续流程 |
|----------|----------|----------|
| 数据结构 | 修改了 `types.ts`、schema、ContentPool 字段 | → 步骤 2 |
| 引擎逻辑 | 修改了 `src/simulation/`、`src/engine/`、`src/combat/` 中的逻辑 | → 步骤 3 |
| 内容数据 | 修改了 YAML 文件、Prompt 中的示例、标签映射 | → 改 YAML，不改代码 |

---

## 步骤 2：修改了 ContentPool 字段

### 2a. 定位所有消费者

```bash
# 找到所有引用此字段的文件（排除测试和 .d.ts）
rg "字段名" src/ --type ts | grep -v __tests__ | grep -v "\.d\.ts"
```

### 2b. 对照完整 checklist

对照 `add-contentpool-field.md` 中的 12 项 checklist，确认每项都已触达。

如果本次改动会让多个模块读取同一字段，或调用点开始重复 `find`、`filter`、默认值、标签映射，继续对照 `content-pool-dao.md`，判断是否需要收敛成内容访问入口。

### 2c. 结果验证

```bash
# 检查是否还有其他地方仍在硬编码相同数据
rg "你删掉的硬编码值" src/ --type ts | grep -v __tests__
```

命令必须返回 0 结果才合格。

---

## 步骤 3：修改了引擎逻辑

### 3a. 检查是否读取了 ContentPool

```bash
# 在修改的文件中搜索 contentPool 引用
grep -n "contentPool" <你修改的文件>
```

如果文件中引用了 `contentPool`，检查是否正确从 `world.contentPool` 获取而非构造函数或本地常量。

### 3b. 检查陷阱 token

对照 `trap-tokens.md`，确认修改的代码中不包含陷阱 pattern。

### 3c. 检查世界状态写入入口

如果修改会改变关系、背包、任务、已知房间、需求、特质或战斗血量，不要在新文件里直接 `push` 或赋值。

原因：这些状态最终会影响服务端返回给客户端的结构。写入口分散后，很容易出现一条路径补齐了字段，另一条路径漏掉字段，客户端看到的结果就不一致。

优先把变化表达成 `SimulationDelta` 并交给现有写入口处理。如果确实需要新增写入口，必须同时说明原因，并更新 `plugins/no-direct-world-mutation.grit` 的允许范围。

---

## 步骤 4：提交前

```bash
npm run lint
npm test
```

然后目视检查 git diff 中是否有 `@deprecated` 注释被忽略。
