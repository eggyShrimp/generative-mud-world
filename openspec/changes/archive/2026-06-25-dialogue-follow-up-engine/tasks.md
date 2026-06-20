# Tasks: dialogue-follow-up-engine

## Module: `src/shared/protocol.ts`

- [x] Add `RequestFollowUpOptionsMessage`
- [x] Add `FollowUpOptionsMessage`
- [x] Add both message types to `ClientMessage` and `ServerMessage`
- [x] Keep follow-up options typed as existing `DialogueOption[]`

## Module: `src/server/ws-server.ts`

- [x] Add Zod schema for `request_follow_up_options` with `npcId` and non-empty `context`
- [x] Add handler branch for `request_follow_up_options`
- [x] Add private `handleFollowUpOptionsRequest(session, npcId, context)` method
- [x] Return `follow_up_options` on success
- [x] Return explicit `error` on invalid NPC, missing player, or generation failure

## Module: `src/index.ts`

- [x] Wire the WebSocket server follow-up handler to `DialogueGenerator.generateFollowUpOptions()`

## Module: `src/llm/dialogue-generator.ts`

- [x] Add public `generateFollowUpOptions(world, playerId, npcId, context)` method
- [x] Build prompt from selected NPC text, current room, NPC context, player relation, and known clues
- [x] Include prompt guidance for selected text that may be the player's own line: generate usable follow-ups from surrounding context without treating it as NPC knowledge
- [x] Parse JSON response into 3-5 `DialogueOption` values with `type: "idle_chat"`
- [x] Deduplicate and trim labels
- [x] Return an empty option list when parsing fails or no valid labels remain
- [x] Update idle chat prompt with relationship feedback rules:
  - normal relation: normal answer
  - good relation: more detail and known clues
  - poor relation: colder tone but still basic answer
- [x] Ensure no prompt rule says secrets, risk, or conflict should block answers

## Module: `src/llm/dialogue-tools.ts`

- [x] Update `suggest_followup_topics` description to say topics are player-facing follow-up questions
- [x] State that normal relation gets practical follow-ups, good relation may get deeper/detail-oriented follow-ups, and poor relation must still keep options usable
- [x] Keep the existing tool schema unchanged

## Tests

- [x] Add `src/__tests__/dialogue-generator.test.ts`: follow-up option generation success
- [x] Add `src/__tests__/dialogue-generator.test.ts`: malformed JSON/failure path returns empty list
- [x] Add `src/__tests__/dialogue-generator.test.ts`: selected player-line context still produces usable follow-up options without treating it as NPC knowledge
- [x] Add `src/__tests__/dialogue-generator.test.ts`: poor relationship does not force refusal-only options or block the reply path
- [x] Add `src/__tests__/dialogue-tools.test.ts`: `suggest_followup_topics` description includes relationship depth guidance and keeps schema unchanged
- [x] Add `src/__tests__/ws-server.test.ts`: follow-up request success response
- [x] Add `src/__tests__/ws-server.test.ts`: invalid context error
- [x] Add/update `src/__tests__/integration/dialogue-pipeline.test.ts`: selected follow-up option continues through existing `talk` path

## Verification

- [x] Run `npm run lint` (biome check + tsc --noEmit)
- [x] Run `npx vitest run`
- [x] Run `npx depcruise src` — confirm no boundary violations
- [x] Trap token re-check: no hardcoded label map, no direct world mutation, no createDefault outside world, no empty catch
