# World Framework — 设计文档索引

| 文件 | 内容 |
|------|------|
| [00-architecture.md](./00-architecture.md) | **主文档** — 整体架构：定位、功能、技术分层、模块清单、协议、TUI、核心约束；子系统×分层矩阵 + 代码模块对应 |
| [01-concepts-and-references.md](./01-concepts-and-references.md) | 关键概念定义、子系统覆盖度、MVP范围与实际实现对照、参考资料 |
| [02-simulation-details.md](./02-simulation-details.md) | 模拟层细节：NPC分层激活、多人并发模型、AOI过滤、NPC记忆系统 |
| [03-llm-interactions.md](./03-llm-interactions.md) | LLM交互筛选框架、14种交互模式+实现状态、触发→调度→持久化全链路、Tool Calling vs JSON解析对照、孤儿工具与缺失工具清单 |
| [04-auto-research.md](./04-auto-research.md) | 组织形式演化、Auto Research、语言演化、统一演化框架；实现状态标注 |
| [05-player-flow.md](./05-player-flow.md) | 玩家接入流程、死亡/退出、反馈闭环、信息流/AOI/日报 |
| [06-content-pool.md](./06-content-pool.md) | 内容池完整生命周期：24字段清单、三层加载、schema覆盖、mutation通路矩阵、LLM工具→mutation→materializer映射、已知缺口清单 |
| [07-quest-storyline.md](./07-quest-storyline.md) | 任务与剧情系统：设计理念、共享基础设施、本质区别、设计原则、关键权衡、LLM角色定位 |
| [TODO.md](./TODO.md) | 待实现计划：6项核心任务的状态追踪（对话沉淀/场景交互/任务/地图/职业文化演化/历史系统） |
| [dev-guide/](./dev-guide/) | **开发指南** — 键位、命令链路、交互模型、TUI组件/样式/排版、日志埋点、测试、配置、YAML内容池维护、ContentPool 数据访问层优化、常见反模式 |
