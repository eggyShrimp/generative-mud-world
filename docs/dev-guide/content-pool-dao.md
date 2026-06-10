# ContentPool 数据访问层优化指南

## 核心类比

可以把 `ContentPool` 看成一个特殊数据库：

- 它存的是游戏世界内容，而不是玩家存档或运行状态。
- 它的数据源是 YAML、默认值和 LLM 演化写回。
- 它的读者是引擎、TUI、prompt 和测试。
- 它的写入方主要是设计师和 LLM 演化管道。

因此，很多 ContentPool 优化可以参考 DAO、数据库约束和数据访问层治理。但目标不是把项目做成数据库项目，而是让内容读取有稳定入口，让引擎不再直接猜数据形状。

一句话原则：

> ContentPool 是内容数据库；引擎应通过稳定访问入口读取内容事实，不应散落字段解释、默认值和映射表。

---

## 类比关系

| 数据库概念 | ContentPool 中的对应物 | 优化目标 |
|------------|------------------------|----------|
| 表 | `ContentPool` 字段或 YAML domain | 字段归属清楚 |
| 行 | 数组条目，如 `actionEffects[]`、`terrainConfig[]` | 可校验、可查找、可演化 |
| 主键 | `type`、`action`、`terrain`、`tag` 等业务 key | 唯一、稳定、不被调用方猜测 |
| 外键 | `needType`、`actionNames`、room tag、template id | 引用存在，错误尽早暴露 |
| Schema | zod schema + TypeScript type | 数据形状有单一契约 |
| Migration | 新增或修改 ContentPool 字段的 12 项闭环 | 不出现半迁移状态 |
| DAO | 内容访问函数、查询函数、选择器 | 调用方不直接拼读复杂结构 |
| Index | 按 key 预处理出的 Map 或查询入口 | 避免到处重复查找逻辑 |
| Constraint | schema、唯一性检查、引用完整性检查 | 坏数据在加载边界暴露 |
| Seed data | base YAML + `createDefaultContentPool()` | 基础世界可启动、可维护 |
| Write model | mutation + materializer + write-back | LLM 产出能运行时生效并持久化 |

---

## 什么时候需要“DAO 化”

出现下面任一情况，就不要继续在调用点直接读字段，应考虑收敛成内容访问入口：

1. 同一个字段被三个以上模块读取。
2. 调用点需要 `find`、`filter`、排序、合并默认值或解释字段语义。
3. 调用点需要把 `Record`、数组、标签、模板转成另一种结构。
4. 多处出现相同的缺失处理、默认值、fallback 或中文显示逻辑。
5. prompt、TUI、引擎都依赖同一组内容事实。
6. 新增字段后需要提醒很多文件同步修改。

反过来，如果某字段只有一个清晰消费者，而且读取方式只是 `pool.xxx`，暂时不需要额外 DAO。

---

## DAO 应该做什么

ContentPool 的访问层应该负责：

- 按 key 查询内容，如动作效果、需求定义、地形配置、房间动作标签。
- 封装“数组字段如何查找”的规则，避免调用点反复 `find`。
- 暴露领域含义明确的方法，而不是暴露 YAML 形状。
- 在加载或初始化阶段建立必要索引。
- 把缺失、重复、引用错误集中暴露。
- 为 prompt、TUI、引擎提供同一份查询结果。

DAO 不应该做：

- 不应该写游戏逻辑。
- 不应该在查询时悄悄创造不存在的数据。
- 不应该把坏数据吞掉后返回看似合理的默认结果。
- 不应该绕开 schema 或修改 ContentPool 原始数据。
- 不应该把引擎约定塞进 ContentPool。

---

## 推荐优化方向

### 1. 字段访问集中化

当某个字段被多处消费时，优先补一个语义化访问入口。

例如，不要让每个调用方都写：

```ts
pool.actionEffects.find((effect) => effect.action === action)
```

应逐步收敛成类似：

```ts
contentQueries.getActionEffect(action)
```

这样以后字段从数组改成 Record，或需要增加唯一性校验，调用方都不用跟着改。

### 2. 查询结果稳定化

访问入口的返回值应该是调用方真正需要的结果，而不是把原始字段结构继续传出去。

好的访问入口回答具体问题：

- 这个动作会影响哪些需求？
- 这个房间 tag 有哪些可用动作？
- 这个地形的移动成本是多少？
- 这个情绪 key 对应什么展示标签？

差的访问入口只是换个名字返回整块 `ContentPool` 字段，调用方仍然要解释数据。

### 3. 建立内容索引

数组字段如果经常按 key 查找，应在边界处建立索引：

- `needDefinitions` 可按 `type` 建索引。
- `actionEffects` 可按 `action` 建索引。
- `terrainConfig` 可按 `terrain` 建索引。
- `questTemplates` 可按任务 id 或触发条件建索引。

索引的价值不是性能优先，而是让唯一性和缺失问题集中暴露。

### 4. 加强约束检查

数据库优化不是只加缓存，更重要的是约束。

ContentPool 应逐步补齐这些检查：

- 数组 key 不重复。
- 引用的 key 必须存在。
- 标签字段覆盖所有会展示的 key。
- prompt 暴露的字段和 schema 保持一致。
- mutation 写回的字段能被 loader 再读回来。

不要把这些检查放到每个消费者里。消费者发现坏数据时已经太晚。

### 5. 把迁移当成闭环

新增或修改 ContentPool 字段，等同于数据库 schema migration。必须对照 `add-contentpool-field.md` 的 12 项闭环。

常见半迁移问题：

- type 加了，schema 没加。
- YAML 加了，loader 没路由。
- prompt 加了，materializer 没处理。
- materializer 生效了，write-back 没持久化。
- 字段加了，消费者仍然使用旧硬编码。

这类问题不要靠调用点 fallback 修，要修迁移链路。

### 6. 区分读模型和写模型

ContentPool 至少有两种模型：

- 读模型：引擎、TUI、prompt 从 ContentPool 查询内容事实。
- 写模型：LLM 通过 mutation 表达变化，再由 materializer 应用并写回 YAML。

不要让写模型绕过读模型，也不要让读模型猜测写模型产物。LLM 能写什么、怎么写、写完如何再加载，必须是一条闭环。

### 7. 避免“查询时兜底”

如果查询不到数据，优先判断是哪一类问题：

- YAML 缺内容。
- schema 没覆盖。
- loader 路由错。
- key 不一致。
- mutation 没持久化。
- 消费者读错字段。

只有确认这是产品上允许的可选内容时，才在访问入口明确返回空结果。不要在消费者里临时补默认值。

---

## 数据库优化经验如何迁移

| 数据库优化经验 | 在 ContentPool 中怎么用 |
|----------------|--------------------------|
| 表结构先建模，再写业务代码 | 先定义字段、schema、YAML domain，再写消费者 |
| DAO 隔离 SQL | 访问入口隔离 ContentPool 原始字段 |
| migration 必须完整 | 新字段必须跑完 12 项 checklist |
| index 服务查询模式 | 高频按 key 查询的数组字段建索引 |
| constraint 防坏数据 | schema、唯一性、引用完整性在加载边界检查 |
| seed data 保证环境可启动 | base YAML 和默认值保持最小可运行 |
| read/write model 分离 | ContentPool 查询与 LLM mutation 分开治理 |
| observability 帮助定位问题 | loader、schema、write-back 出错时必须有日志 |

---

## 判断某个优化是否正确

可以用下面的问题快速自查：

1. 这个改动是否减少了调用方对 ContentPool 内部形状的了解？
2. 是否把重复的查找、解释、缺失处理收敛到了一个入口？
3. 是否让坏数据更早暴露，而不是更晚被 fallback 掩盖？
4. 是否维护了数据与引擎的硬边界？
5. 是否让 LLM 演化、YAML、schema、消费者之间更容易保持同步？
6. 是否避免新增一份和 ContentPool 重复的常量或映射？

如果答案大多是否，这个优化可能只是换了代码位置，不是真正的数据访问层优化。

---

## 实施顺序建议

1. 先梳理消费者最多的字段。
2. 找出重复的 `find`、`filter`、标签映射、默认值处理。
3. 为这些字段补语义化查询入口。
4. 在查询入口附近补唯一性和引用检查。
5. 更新消费者，让它们只问问题，不解释字段。
6. 用测试覆盖加载、查询和典型消费者。

优先处理会跨引擎、TUI、prompt 的字段。只服务单个模块的字段可以晚一点处理。

---

## 与现有文档的关系

- `docs/06-content-pool.md`：描述 ContentPool 当前结构、生命周期和已知缺口。
- `docs/dev-guide/content-pool-yaml.md`：指导如何维护 YAML 内容。
- `docs/dev-guide/add-contentpool-field.md`：新增字段时的强制 checklist。
- 本文：指导如何把 ContentPool 优化成稳定的数据访问层。

如果这些文档之间出现冲突，以 `docs/06-content-pool.md` 的字段清单和生命周期为准。
