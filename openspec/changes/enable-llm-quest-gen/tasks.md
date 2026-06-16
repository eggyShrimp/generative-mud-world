# Tasks: enable-llm-quest-gen

## Module: `src/llm/tools/content-pool-evolve.ts`

- [x] 新增 `ADD_QUEST_TEMPLATE_TOOL` 工具定义，含完整 QuestTemplate JSON Schema（objectives、rewards、autoDiscover、autoTrigger、prerequisites、minRelation、stages、abandonPenalty 等全部可选字段）→ `src/llm/tools/content-pool-evolve.ts`
- [x] 将 `ADD_QUEST_TEMPLATE_TOOL` 加入 `CONTENT_POOL_EVOLVE_TOOLS` 数组首位，使其成为 LLM 可用的工具 → `src/llm/tools/content-pool-evolve.ts`

## Module: `src/llm/prompts/content-pool-evolve.ts`

- [x] 在系统 prompt 中新增「任务生成核心规则」段落 → `src/llm/prompts/content-pool-evolve.ts`
- [x] 列出禁止模式（单一 talk 目标、无因果链描述、不引用已有实体、千篇一律奖励）→ `src/llm/prompts/content-pool-evolve.ts`
- [x] 提供优质任务示例（「千佛暗码」）和劣质任务示例对比 → `src/llm/prompts/content-pool-evolve.ts`
- [x] 扩展 `buildContentPoolEvolvePrompt` 的 context 接口，新增 `existingNpcs`、`existingRooms`、`existingQuests`、`existingItemTemplates`、`existingClues` 可选字段 → `src/llm/prompts/content-pool-evolve.ts`
- [x] 在 user message 中渲染 NPC/房间/任务/物品/线索的 Markdown 列表 → `src/llm/prompts/content-pool-evolve.ts`
- [x] 修复 user message 遗漏旧 context 字段 — 补回 `existingNeeds`、`existingActions`、`existingRoles`、`existingCultures`、`existingTraitLabels`、`previousRoomTemplateCultures` 到 JSON 输出 → `src/llm/prompts/content-pool-evolve.ts`
- [x] 补全 context 接口中缺失的 `existingTraitLabels` 字段 → `src/llm/prompts/content-pool-evolve.ts`

## Module: `src/llm/dispatcher.ts`

- [x] 在 `content_pool_evolve` 触发检测器中，从 `world.entities` 构建 NPC 摘要（id/name/room/tags/personality）→ `src/llm/dispatcher.ts`
- [x] 从 `world.rooms` + `world.regions` 构建房间摘要（id/name/region/tags）→ `src/llm/dispatcher.ts`
- [x] 从 `pool.questTemplates` 构建已有任务摘要（id/title）→ `src/llm/dispatcher.ts`
- [x] 从 `pool.itemTemplates` 构建物品模板摘要（id/name）→ `src/llm/dispatcher.ts`
- [x] 从 `pool.clueDefinitions` 构建线索摘要（id/description）→ `src/llm/dispatcher.ts`
- [x] 将所有摘要注入 trigger context 对象 → `src/llm/dispatcher.ts`

## OpenSpec Delta

- [x] 创建 `openspec/changes/enable-llm-quest-gen/specs/world-engine/spec.md`：3 条 ADDED requirement + 8 个 scenarios，覆盖工具定义、上下文传递、质量约束

## Tests

- [x] 更新 `src/__tests__/llm-dispatcher.test.ts`：新增 `should include world-state context in content_pool_evolve LLM prompt` 测试 — 验证 user message 包含基础 context 字段、NPC/房间/任务/物品/线索摘要；验证 system prompt 包含任务质量约束和优劣示例；验证工具定义包含 `add_quest_template`
- [x] 已有 `src/__tests__/quest-tracker.test.ts`：`quest_mogao_cipher` 全流程测试（talk → explore → talk → complete + rewards 验证）— 26 tests pass

## Manual Checks

- [ ] 启动游戏 → 推进到第 1 天（checkDay）→ 触发 `content_pool_evolve` → 检查 LLM 是否调用 `add_quest_template` 或输出包含 `addQuestTemplates` 的 JSON
- [ ] 检查生成的任务是否：引用真实 NPC/房间 ID、包含混合目标类型、有因果链描述、奖励与叙事挂钩
- [ ] 检查 `worlds/content-pool/evolve/quests.yaml` 是否生成且可被 `content-pool-loader` 加载

## Verification
- [x] Run `npm run lint` (biome check + tsc --noEmit) — clean on all changed files
- [x] Run `npx vitest run` — 865 tests pass, 52/52 files
- [x] Run `npx depcruise src` — no boundary violations
- [x] Trap token re-check: no-hardcoded-labels (✅), no-direct-world-mutation (✅), no-create-default-outside-world (✅), no-hardcoded-description-text (✅)
