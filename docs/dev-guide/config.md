---
name: config
description: >
  项目配置文件一览。
  Use for: configuration files, settings, environment setup.
---

# 配置

## 优先级

```
环境变量  >  world.config.yaml  >  代码默认值
(最高)                            (最低)
```

| 配置 | 文件 |
|------|------|
| **统一配置** | `world.config.yaml`（端口、LLM、存档、日志等全部设置） |
| **敏感信息** | `world.config.yaml` 中的 `llm.apiKey`（不提交到 repo） |
| **LLM 默认值** | `~/.config/opencode/opencode.json`（自动读取 DeepSeek） |
| **客户端配置** | `~/.config/world-client/config.json`（TUI 设置保存于此） |
| **启动脚本** | `start.sh`（`all\|server\|client\|dev\|test\|status\|logs`） |

## world.config.yaml

主配置文件，包含所有运行时设置。详细字段见 `world.config.example.yaml`。

```yaml
server:
  port: 3000

llm:
  baseUrl: "https://api.deepseek.com/v1"
  apiKey: "your-api-key"
  model: "deepseek-v4-pro"

  dialogue:                    # 对话专用
    model: "deepseek-v4-flash"
    baseUrl: null              # null = 继承 llm.baseUrl
    apiKey: null

  settlement:                  # 结算专用
    model: "deepseek-v4-flash"
    baseUrl: null
    apiKey: null

  worldGeneration:             # 世界生成专用
    model: null                # null = 继承 llm.model
    baseUrl: null
    apiKey: null

world:
  file: "worlds/generated_continent.yaml"

save:
  dir: "saves"
  selectMode: "skip"
  defaultSlot: "slot_001"

log:
  file: null
  level: "ws"
```

## 环境变量速查

### 顶层

| 环境变量 | 对应配置字段 | 默认值 |
|----------|-------------|--------|
| `WORLD_SERVER_PORT` | `server.port` | `3000` |
| `LLM_BASE_URL` | `llm.baseUrl` | `http://localhost:11434/v1` |
| `LLM_API_KEY` | `llm.apiKey` | `ollama` |
| `LLM_MODEL` | `llm.model` | `deepseek-chat` |
| `WORLD_FILE` | `world.file` | `worlds/generated_continent.yaml` |
| `SAVE_DIR` | `save.dir` | `saves` |
| `SAVE_SELECT` | `save.selectMode` | `skip` |
| `SAVE_SLOT` | `save.defaultSlot` | `slot_001` |
| `WORLD_LOG_FILE` | `log.file` | `~/.config/world-client/world.log` |
| `WORLD_LOG_LEVEL` | `log.level` | `ws` |

### LLM 场景覆盖

| 场景 | model | baseUrl | apiKey |
|------|-------|---------|--------|
| 对话 | `LLM_DIALOGUE_MODEL` | `LLM_DIALOGUE_BASE_URL` | `LLM_DIALOGUE_API_KEY` |
| 结算 | `LLM_SETTLEMENT_MODEL` | `LLM_SETTLEMENT_BASE_URL` | `LLM_SETTLEMENT_API_KEY` |
| 世界生成 | `LLM_WORLD_GENERATION_MODEL` | `LLM_WORLD_GENERATION_BASE_URL` | `LLM_WORLD_GENERATION_API_KEY` |

`null` 或未设置 = 继承顶层 `llm.*` 对应字段。

## wsUrl

客户端连接地址由 `server.port` 自动推导：`ws://localhost:{port}`。

局域网场景可用 `WORLD_WS_URL` 环境变量覆盖：
```bash
WORLD_WS_URL=ws://192.168.1.100:3000 ./start.sh client
```
