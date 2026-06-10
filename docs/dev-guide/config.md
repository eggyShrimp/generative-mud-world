---
name: config
description: >
  项目配置文件一览。
  Use for: configuration files, settings, environment setup.
---

# 配置

| 配置 | 文件 |
|------|------|
| LLM 默认值 | `~/.config/opencode/opencode.json`（自动读取 DeepSeek） |
| 客户端配置 | `~/.config/world-client/config.json`（TUI 设置保存于此） |
| 服务端环境 | `.env`（`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`） |
| 启动脚本 | `start.sh`（`all\|server\|client\|dev\|test\|status\|logs`） |
| 日志级别 | 环境变量 `WORLD_LOG_LEVEL`（`info`\|`ws`\|`evt`\|`key`\|`dbg`） |
