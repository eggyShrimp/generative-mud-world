# Tasks: dialogue-follow-up-engine

## Module: `src/shared/protocol.ts`

- [ ] Add `RequestFollowUpOptionsMessage`
- [ ] Add `FollowUpOptionsMessage`
- [ ] Add both message types to `ClientMessage` and `ServerMessage`
- [ ] Keep follow-up options typed as existing `DialogueOption[]`

## Module: `src/server/ws-server.ts`

- [ ] Add Zod schema for `request_follow_up_options` with `npcId` and non-empty `context`
- [ ] Add handler branch for `request_follow_up_options`
- [ ] Add private `handleFollowUpOptionsRequest(session, npcId, context)` method
- [ ] Return `follow_up_options` on success
- [ ] Return explicit `error` on invalid NPC, missing player, or generation failure

## Module: `src/index.ts`

- [ ] Wire the WebSocket server follow-up handler to `DialogueGenerator.generateFollowUpOptions()`

## Module: `src/llm/dialogue-generator.ts`

- [ ] Add public `generateFollowUpOptions(world, playerId, npcId, context)` method
- [ ] Build prompt from selected NPC text, current room, NPC context, player relation, and known clues
- [ ] Include prompt guidance for selected text that may be the player's own line: generate usable follow-ups from surrounding context without treating it as NPC knowledge
- [ ] Parse JSON response into 3-5 `DialogueOption` values with `type: "idle_chat"`
- [ ] Deduplicate and trim labels
- [ ] Return an empty option list when parsing fails or no valid labels remain
- [ ] Update idle chat prompt with relationship feedback rules:
  - normal relation: normal answer
  - good relation: more detail and known clues
  - poor relation: colder tone but still basic answer
- [ ] Ensure no prompt rule says secrets, risk, or conflict should block answers

## Module: `src/llm/dialogue-tools.ts`

- [ ] Update `suggest_followup_topics` description to say topics are player-facing follow-up questions
- [ ] State that normal relation gets practical follow-ups, good relation may get deeper/detail-oriented follow-ups, and poor relation must still keep options usable
- [ ] Keep the existing tool schema unchanged

## Tests

- [ ] Add `src/__tests__/dialogue-generator.test.ts`: follow-up option generation success
- [ ] Add `src/__tests__/dialogue-generator.test.ts`: malformed JSON/failure path returns empty list
- [ ] Add `src/__tests__/dialogue-generator.test.ts`: selected player-line context still produces usable follow-up options without treating it as NPC knowledge
- [ ] Add `src/__tests__/dialogue-generator.test.ts`: poor relationship does not force refusal-only options or block the reply path
- [ ] Add `src/__tests__/dialogue-tools.test.ts`: `suggest_followup_topics` description includes relationship depth guidance and keeps schema unchanged
- [ ] Add `src/__tests__/ws-server.test.ts`: follow-up request success response
- [ ] Add `src/__tests__/ws-server.test.ts`: invalid context error
- [ ] Add/update `src/__tests__/integration/dialogue-pipeline.test.ts`: selected follow-up option continues through existing `talk` path

## Verification

- [ ] Run `npm run lint` (biome check + tsc --noEmit)
- [ ] Run `npx vitest run`
- [ ] Run `npx depcruise src` — confirm no boundary violations
- [ ] Trap token re-check: no hardcoded label map, no direct world mutation, no createDefault outside world, no empty catch
