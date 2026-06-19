# Proposal: dialogue-option-behavior-protocol

## Why

对话窗口现在根据 `DialogueOption.type` 的命名约定推断行为：`*_menu` 和 `idle_chat` 会等待后续选项，`close` 会关闭，任务接受这类 `*_select` 选项之前没有被纳入等待范围，导致玩家接受任务后服务端虽然返回了后续对话，客户端窗口仍停在旧选项。

这说明当前协议缺少一层通用对话行为契约。任务对话、普通闲聊、功能动作不应该让客户端分别理解业务类型名；它们都应该先生成同一种对话选项，并由选项明确描述“选中后窗口怎么反应”。任务只是对话协议上的一种业务扩展。

## Change Type

**cross-cutting protocol change** — shared protocol + server-side option generation + TUI client behavior.

OpenSpec formal deltas are split by capability:

- `world-engine`: shared protocol fields, server/generator responsibilities, and route compatibility.
- `world-tui`: client-side interpretation and popup state behavior.

No ContentPool schema or YAML data changes.

## What Changes

- Add an explicit `behavior` contract to `DialogueOption`.
- Keep existing `DialogueOption.type` for business routing and backward compatibility.
- Server-generated dialogue options MUST include behavior for all normal dialogue options.
- The behavior contract MUST describe whether selecting an option closes the popup, waits for returned chat options, or simply keeps the popup open.
- Quest negotiation options become ordinary dialogue options with task-specific business type plus common behavior:
  - accept: keep popup open and wait for returned chat options
  - defer: close popup after sending talk
  - ordinary follow-up: keep popup open and wait for returned chat options
  - goodbye: close popup after sending talk
- TUI MUST use `option.behavior` as the primary source of truth for popup behavior.
- Legacy options without behavior MUST pass through a single compatibility classifier during migration.
- Remove scattered client decisions based on task-specific option types once all server paths emit behavior.

## Modules Touched

| File | Change Type | Description |
|------|-------------|-------------|
| `src/shared/protocol.ts` | modify-interface | Add `DialogueOptionBehavior` and optional `DialogueOption.behavior`. |
| `src/llm/dialogue-generator.ts` | modify-logic | Attach behavior to generated chat, task, quest delivery, and functional options. |
| `src/core/round-engine.ts` | inspect / maybe no-change | Preserve existing returned sub-option route; no new mutation path. |
| `src/server/ws-server.ts` | inspect / maybe no-change | Forward options as protocol data; no client-specific behavior inference. |
| `src/tui/client/dialogue-state.ts` | modify-logic | Replace type-name guessing with behavior-first helpers and one legacy classifier. |
| `src/tui/client/game-client.ts` | modify-logic | Drive loading, close, and option refresh from behavior. |
| `src/__tests__/dialogue-generator.test.ts` | add-tests | Verify generated options include expected behavior. |
| `src/__tests__/round-engine.test.ts` | add-tests if needed | Verify talk route still returns behavior-bearing sub-options. |
| `src/__tests__/game-client.test.ts` | add-tests | Verify client uses behavior and legacy fallback remains centralized. |
| `src/__tests__/integration/dialogue-pipeline.test.ts` | add-tests | Verify accept/follow-up/close behavior over the normal dialogue pipeline. |

## ContentPool Reads

No new ContentPool reads and no new ContentPool fields.

Existing reads in `DialogueGenerator` remain unchanged:

| pool.xxx field | Purpose |
|----------------|---------|
| `questTemplates` | Identify eligible quest trigger and delivery options. |
| `conversationDirections` | Generate ordinary dialogue directions. |
| `dialogueEffectMapping` | Map dialogue effects to deltas through the existing path. |

## Protocol Contract

`DialogueOption.type` remains the business action route. `DialogueOption.behavior` becomes the UI/state contract.

Suggested shape:

```ts
export type DialogueOptionBehavior =
  | { kind: "continue"; expects: "chat_options" }
  | { kind: "close" }
  | { kind: "stay"; expects?: "none" };
```

Required initial mapping:

| Option source | `type` examples | Behavior |
|---------------|-----------------|----------|
| submenu entry | `quest_trigger_menu`, `quest_deliver_menu`, `functional_menu` | `{ kind: "continue", expects: "chat_options" }` |
| ordinary chat / follow-up | `idle_chat` | `{ kind: "continue", expects: "chat_options" }` |
| action selection with post options | `quest_trigger_select`, `quest_deliver_select`, `functional_select` | `{ kind: "continue", expects: "chat_options" }` |
| defer / goodbye | `quest_defer`, `close` | `{ kind: "close" }` |

The exact TypeScript representation may be adjusted during implementation if it improves ergonomics, but the behavior MUST remain explicit and option-local.

## Non-Goals

- Do not add a new quest acceptance path.
- Do not make the TUI import engine, core, simulation, or LLM modules.
- Do not put task-specific window rules in the TUI.
- Do not add ContentPool fields for UI protocol behavior.
- Do not require the client to echo the full behavior object back to the server; `optionId`, `optionType`, and label remain sufficient for routing.
- Do not change how quest state is written; acceptance still goes through existing deltas.

## Impact

- Client behavior becomes protocol-driven instead of inferred from task type names.
- New dialogue option types can be added without editing TUI popup heuristics as long as they provide behavior.
- Quest negotiation becomes a clean extension of the base dialogue protocol.
- During migration, legacy options remain usable through a single compatibility function.

## Test Impact

| Test File | Coverage |
|-----------|----------|
| `src/__tests__/dialogue-generator.test.ts` | All generated option categories include correct behavior. |
| `src/__tests__/game-client.test.ts` | Behavior drives close/loading/waiting; legacy fallback is centralized and covered. |
| `src/__tests__/integration/dialogue-pipeline.test.ts` | Quest accept and ordinary follow-up refresh the popup through returned chat options. |
| `src/__tests__/round-engine.test.ts` | Returned sub-options preserve behavior through engine result if generator-only coverage is insufficient. |

