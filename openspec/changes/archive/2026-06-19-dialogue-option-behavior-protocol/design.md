# Design: dialogue-option-behavior-protocol

## Core Model

The dialogue protocol separates two concerns:

| Concern | Field | Owner | Consumer |
|---------|-------|-------|----------|
| Business routing | `DialogueOption.type` and `id` | engine / generator | server and engine talk route |
| Popup behavior | `DialogueOption.behavior` | option producer | TUI client |

The TUI must not infer popup behavior from task-specific type names once behavior exists. It may use a single compatibility classifier only for options that predate the behavior field.

## Protocol Shape

Add a behavior field to `DialogueOption`:

```ts
export type DialogueOptionBehavior =
  | { kind: "continue"; expects: "chat_options" }
  | { kind: "close" }
  | { kind: "stay"; expects?: "none" };

export interface DialogueOption {
  id: string;
  label: string;
  type: DialogueOptionType;
  behavior?: DialogueOptionBehavior;
  tag?: string;
  meta?: Record<string, unknown>;
  expectedEffects?: {
    relationDelta?: number;
    needDelta?: Record<string, number>;
    risk?: string;
  };
}
```

`behavior` is optional for migration only. New server-produced options must include it.

## Data Flow

### Flow 1: First Dialogue Menu

```text
TUI requests chat options
  -> ws-server asks DialogueGenerator
  -> DialogueGenerator builds options
  -> each option receives behavior
  -> ws-server sends chat_options
  -> TUI renders options and stores behavior with each option
```

### Flow 2: Player Selects a Continue Option

```text
player selects option.behavior.kind = "continue"
  -> TUI appends player line
  -> TUI clears visible options and marks chat loading
  -> TUI sends existing talk request
  -> RoundEngine handles option by type/id
  -> server sends command_result and chat_options
  -> TUI appends NPC reply and replaces options
```

This covers ordinary chat, task submenu entry, quest accept, quest delivery, and functional action selection when the server returns post-action options.

### Flow 3: Player Selects a Close Option

```text
player selects option.behavior.kind = "close"
  -> TUI sends existing talk request
  -> TUI closes popup locally
  -> server route clears any pending negotiation or close-side state
```

This covers goodbye and quest defer.

### Flow 4: Legacy Option Without Behavior

```text
option.behavior missing
  -> TUI calls classifyLegacyDialogueOption(option)
  -> helper maps existing type names to a behavior
  -> all popup code uses the returned behavior
```

The compatibility helper must be the only place that interprets `DialogueOption.type` for UI behavior.

## Required Behavior Mapping

| Option category | Types | Required behavior |
|-----------------|-------|-------------------|
| Opens submenu / negotiation | `*_menu` | `continue/chat_options` |
| Ordinary chat | `idle_chat` | `continue/chat_options` |
| Action returns post-select options | `*_select` | `continue/chat_options` |
| Explicit close | `close` | `close` |
| Quest defer | `quest_defer` | `close` |

If a future option changes world state but does not return options, it must use an explicit behavior that is not confused with close. That is the purpose of `stay`.

## Engine Responsibilities

`DialogueGenerator` is responsible for attaching behavior when it creates `DialogueOption` objects:

- first-round fixed chat menu
- LLM-generated ordinary chat directions
- quest trigger menu options
- quest negotiation accept/defer/follow-up/goodbye options
- quest delivery options
- functional service options
- post-select options
- follow-up options generated from selected NPC text

The engine must keep quest acceptance and other world changes on existing delta paths. Behavior is protocol metadata, not a write path.

## TUI Responsibilities

The client must convert an option to behavior once, then use that behavior for:

- whether the popup stays visible
- whether visible options are cleared
- whether the active tab shows loading
- whether a `chat_options` callback is registered
- whether direct local close needs a cleanup request

The TUI must not contain task-specific checks such as "`quest_trigger_select` means wait for options" outside the legacy classifier.

## Compatibility Plan

1. Add optional `behavior` to the protocol type.
2. Add a TUI helper that returns `option.behavior ?? classifyLegacyDialogueOption(option)`.
3. Migrate generator-produced options to include behavior.
4. Update tests to assert behavior-bearing options.
5. After all current paths are covered, leave the fallback in place for external or saved legacy data, but keep it centralized.

## ContentPool Integration

No ContentPool field changes are required.

No behavior label or player-facing text is added in code. Behavior is structural protocol metadata.

## State Mutation Path

| Change | Path |
|--------|------|
| Quest acceptance | Existing `SimulationDelta.questChanges -> applyDelta` |
| Dialogue reply | Existing dialogue delta / command event path |
| Popup loading and close | TUI local state only |
| Protocol behavior metadata | Generated option data only |

## Boundary Checks

| Boundary | Requirement |
|----------|-------------|
| TUI imports | TUI may import `src/shared/protocol.ts`, but must not import engine/core/simulation/LLM modules. |
| Engine state writes | No direct world mutation added for dialogue behavior. |
| ContentPool | No schema, YAML, or default content changes. |
| Hardcoded labels | No new display label maps. Behavior enum values are structural protocol terms. |

## Test Plan

| Test File | Scenario | Assertions |
|-----------|----------|------------|
| `src/__tests__/dialogue-generator.test.ts` | first-round menu generation | Every option has behavior; task entries and idle chat continue; close closes. |
| `src/__tests__/dialogue-generator.test.ts` | quest negotiation generation | accept and follow-up continue; defer and goodbye close. |
| `src/__tests__/dialogue-generator.test.ts` | post-select options | post-select returned goodbye has close behavior. |
| `src/__tests__/game-client.test.ts` | behavior continue | Client clears options, shows loading, sends talk, and consumes returned `chat_options`. |
| `src/__tests__/game-client.test.ts` | behavior close | Client sends talk and closes popup. |
| `src/__tests__/game-client.test.ts` | legacy classifier | Existing type-only options still map correctly through one helper. |
| `src/__tests__/integration/dialogue-pipeline.test.ts` | quest accept route | Accept option refreshes popup using returned options through the normal talk route. |

## Manual Checks

No manual-only check is required. The behavior is state/protocol driven and should be covered by Vitest.

