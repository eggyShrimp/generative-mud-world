# Tasks: dialogue-quest-intent-markers

## Spec Review

- [x] Confirm whether `giverNpcId` means "NPC can publish this quest through dialogue".
- [x] Confirm `[!]` plus quest accent color is the quest intent marker for both quest trigger and quest delivery options.
- [x] Confirm no separate marker is needed for ordinary follow-up/question options in this change.
- [x] Confirm storyline child quests must not appear as standalone NPC quest intents.

## Module: `src/llm/dialogue-generator.ts`

- [x] Rename or replace the current eligible storyline helper with a broader quest intent helper.
- [x] Include eligible NPC-given ordinary quests in quest trigger directions.
- [x] Preserve eligible talk-triggered storyline directions.
- [x] Preserve completed active quest delivery directions.
- [x] Ensure all quest trigger / delivery menu options set `tag: "quest"`.
- [x] Keep marker punctuation out of prompt instructions and LLM labels.
- [x] On LLM parse failure, keep deterministic quest intent fallback options with `tag: "quest"`.

## Module: `src/engine/quest-tracker.ts`

- [x] Reuse existing prerequisite checking instead of duplicating nested prerequisite logic.
- [x] Reuse existing storyline child quest detection instead of duplicating child quest rules.
- [x] If helper extraction is needed, export a narrow function that has no side effects.
- [x] Do not accept or mutate quests during menu generation.

## Module: `src/tui/components/key-hint.tsx`

- [x] Change `tag === "quest"` rendering from bare suffix `!` to a trailing `[!]` badge after the label.
- [x] Verify existing `tag === "quest"` rendering applies quest accent color.
- [x] Keep `[!]` required even when color is present.
- [x] Avoid adding marker text to labels.
- [x] Only change this file if current rendering cannot satisfy the spec.

## Tests

- [x] Add `src/__tests__/dialogue-generator.test.ts`: NPC-given ordinary quest appears as `quest_trigger_menu` with `tag: "quest"`.
- [x] Add `src/__tests__/dialogue-generator.test.ts`: talk-triggered storyline still appears as `quest_trigger_menu` with `tag: "quest"`.
- [x] Add `src/__tests__/dialogue-generator.test.ts`: completed active quest from same NPC appears as `quest_deliver_menu` with `tag: "quest"`.
- [x] Add `src/__tests__/dialogue-generator.test.ts`: active quest is not offered as a new trigger.
- [x] Add `src/__tests__/dialogue-generator.test.ts`: completed non-repeatable quest is not offered.
- [x] Add `src/__tests__/dialogue-generator.test.ts`: unmet prerequisites block the option.
- [x] Add `src/__tests__/dialogue-generator.test.ts`: unmet min relation blocks the option.
- [x] Add `src/__tests__/dialogue-generator.test.ts`: repeatable cooldown blocks the option.
- [x] Add `src/__tests__/dialogue-generator.test.ts`: storyline child quest is not offered standalone.
- [x] Add `src/__tests__/dialogue-generator.test.ts`: LLM-generated quest label does not need to contain `!`.
- [x] Add `src/__tests__/dialogue-generator.test.ts`: LLM parse failure fallback preserves `tag: "quest"`.

## Verification

- [x] Run `npx vitest run src/__tests__/dialogue-generator.test.ts`.
- [x] Run `npm run build -- --noEmit`.
- [x] Run `git diff --check`.
- [x] Run trap-token checks on modified TypeScript files.
