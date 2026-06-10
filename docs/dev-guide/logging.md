---
name: logging
description: >
  日志埋点规范：统一日志文件、日志级别、埋点格式。
  Use for: adding logging, debug output, log formatting, instrumentation.
---

# 日志埋点规范

## 统一日志文件

全部日志写入 `world.log`，位置由 `WORLD_LOG_FILE` 环境变量指定。

```bash
./start.sh logs          # 实时查看
tail -f world.log        # 直接 tail
```

## 格式

```
[HH:MM:SS.mmm] [src] level message
```

| 字段 | 值 | 说明 |
|------|-----|------|
| `src` | `srv` / `cli` | 服务端或客户端 |
| `level` | `info` / `evt` / `ws` / `perf` / `key` / `dbg` | 日志级别 |

## 日志级别

| level | 含义 | 默认 | 示例 |
|-------|------|------|------|
| `info` | 连接/断连/回合变化 | ✓ | `[srv] info Player connected: x → 探索者` |
| `evt` | 事件具体内容 | ✓ | `[cli] evt 观察 李福。性格: 勤劳朴实` |
| `ws` | WS 消息摘要（action + key params） | ✓ | `[cli] ws send execute look target=李福` |
| `perf` | 性能指标（LLM耗时/token等） | ✓ | `[srv] perf [LLM] model=llama3 type=dialogue-reply duration=1200ms tokens={prompt:512,completion:120}` |
| `key` | 按键事件 | ✗ | `[cli] key pressed n (phase=game)` |
| `dbg` | 原始 JSON dump | ✗ | `[cli] dbg {"type":"command_result",...}` |

`WORLD_LOG_LEVEL=dbg` 开启全部。

## 全链路排查示例

```
[02:38:10.815] [cli] key pressed 2 (phase=game)
[02:38:10.816] [cli] ws  send execute look target=李福
[02:38:10.817] [srv] ws  recv execute look target=李福
[02:38:10.818] [srv] info [Round 0] player_01: look {target:李福}
[02:38:10.819] [srv] ws  send command_result look events=1
[02:38:10.819] [cli] ws  recv command_result look events=1
[02:38:10.820] [cli] evt  观察 李福。性格: 勤劳朴实
```

按键 → WS → 服务端 → 响应 → 事件渲染，一条链在同一屏。

## 添加新埋点

```ts
import { logWrite } from "../shared/log.ts"

// 服务端
logWrite("srv", "info", "Player connected: ...")
logWrite("srv", "ws", "send command_result look events=1")

// 客户端
logWrite("cli", "info", "connected to server")
logWrite("cli", "ws", "recv state_update room=冰喉要塞大厅")
logWrite("cli", "evt", "观察 李福。性格: 勤劳朴实")
```

## 规范

- **默认不 dump 原始 JSON**。原始内容放 `dbg`，由 `WORLD_LOG_LEVEL` 控制。
- **状态消息去重**：`status`/`state_update` 仅在内容变化时记录，不每次重复。
- **不在组件里直接写日志**：键盘日志只放 `key` 级别，组件代码不引入 `logWrite`。
- **消息摘要可读**：`send execute look target=李福`，不用 `send {"type":"execute","action":"look","params":{"target":"李福"}}`。
- **共用一个工具函数**：`src/shared/log.ts` 是唯一日志入口，服务端和客户端都引同一文件。

## 基础设施日志

引擎/加载/演化等非游戏运行时事件的日志：

| 方法 | 用途 | 示例 |
|------|------|------|
| `console.log` | 启动/加载/演化生命周期 | `[ContentPoolLoader] Loading from: ...` |
| `console.error` | 异常/失败 | `LLM dispatch failed...` |
| `logWrite("srv", "info", ...)` | 需要持久化到日志文件的事件 | `ContentPool evolve persisted` |

格式: `[ComponentName] <消息>`，与 `[SettlementGrowth]`、`[ContentPoolEvolve]` 风格一致。

### 常用 ComponentName

| 前缀 | 模块 |
|------|------|
| `[ContentPoolLoader]` | ContentPool YAML 加载/演化写回 |
| `[ContentPoolMaterializer]` | ContentPool mutation 应用 |
| `[WorldLoader]` | 世界加载入口 |
| `[SettlementGrowth]` | 定居点增长 LLM 触发 |
| `[ContentPoolEvolve]` | ContentPool 演化 LLM 触发 |
