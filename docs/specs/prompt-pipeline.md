---
name: prompt-pipeline
description: 将 dialogue-generator.ts 中散落的 prompt 构建逻辑重构为可组合的 stage pipeline，消除重复、保证关系/语气在所有 NPC 对话类型中一致
status: draft
---

# Prompt Pipeline 重构

## 问题

`dialogue-generator.ts` 有 10 个 prompt 构建点，各自手写 system prompt 字符串：

| 构建点 | 行号 | 传入关系？ | 上下文来源 |
|--------|------|:----------:|------------|
| `buildConversationMenuPrompt` | :283 | ✅ | `buildContext()` |
| `tryGenerateQuestMenu` | :783 | ❌ | `buildContext()`（但只取 4/13 字段） |
| `generateTradeReply` | :1220 | ✅ | 绕过 context builder，直接读 entity |
| `executeQuestTrigger` | :1306 | ❌ | `buildMinimalContext()`（只取 npcRole） |
| `executeQuestDeliver` | :1365 | ❌ | `buildMinimalContext()` |
| `executeFunctional` | :1431 | ❌ | `buildMinimalContext()` |
| `generateMenuTransitionDelta` | :1940 | ❌ | `buildMinimalContext()` |
| `buildIdleChatPrompt` | :1646 | ✅ | `buildContext()` |
| `buildFollowUpOptionsPrompt` | :1709 | ✅ | `buildContext()` |
| `generateAndSaveConversationSummary` | :1813 | — | ContentPool 模板 |

**核心矛盾**：`buildContext()` 已经算好 13 个字段（含 `relationshipLevel`/`relationshipLabel`），但 5 个构建点根本没用它；另外 4 个用了但只取子集，没有统一约束。

具体表现：
- 法显和玩家关系为 0（陌生人），却直接用"请你帮我做任务"的语气
- quest_trigger / quest_deliver / functional / menu_transition 四个提示几乎一模一样，复制了 4 次
- trade 的关系信息是自己从 entity 重新算的，绕过了 `buildContext()`
- 15 处硬编码中文兜底（`"陌生人"`、`"无"`、`"普通"`、`"铜币"` 等），违反 ContentPool 优先架构

### 副产品：消除硬编码兜底

Stage 函数不设兜底值。空数据时返回 null，由 `assemble()` 的 `filter(Boolean)` 过滤，不在 prompt 中输出无效片段。这将清除 15 处硬编码中文兜底：

| 来源 | 兜底 | 去处 |
|------|------|------|
| `prompts/dialogue.ts` | `"友好"/"普通"/"冷淡"`、`"当地居民"`、`"无"`×3 | Step 1 删文件 |
| `buildMinimalContext()` | `"居民"` | Step 6 删方法 |
| `buildContext()` | `"陌生人"`×2、`"普通"`、`"未知地点"`、`"平静"` | 走已有 ContentPool 路径或 stage 返回 null |
| LLM prompt 内联 | `"无"`×5、`"铜币"`、`"功能"`、`"告别"`×3、`"此前对话概要"`、摘要模板 | stage 返回 null 或走已有 ContentPool 字段 |

所有兜底的消除逻辑相同：stage 数据不足 → 返回 null → `assemble` 跳过该段，无副作用。

## 方案：Stage Pipeline

将 prompt 构建拆成**可组合的 stage**，每个对话类型声明自己需要哪些 stage，pipeline 负责组装。

### 类型定义

```typescript
// 每个 stage 接收 context，返回 prompt 片段或 null（跳过）
type PromptStage = (ctx: PromptContext) => string | null;

// PromptContext = buildContext() 返回值 + 任务/交易特有数据
interface PromptContext extends ReturnType<DialogueGenerator['buildContext']> {
  taskExtras?: {
    quest?: { title: string; description: string; objectives: string };
    trade?: { itemName: string; price: number; scenario: string };
    functional?: { label: string };
  };
}
```

### 组装器

Pipeline 只负责 `system` prompt。`user` prompt 由各调用点保持原样（通常一句话，不值得管道化）。

```typescript
function assemble(stages: PromptStage[], ctx: PromptContext): string {
  return stages.map(s => s(ctx)).filter(Boolean).join("\n\n");
}
```

### Stage 定义（14 个）

| Stage | 产出 | 条件 |
|-------|------|------|
| `persona(role: string)` | `你是 MUD 游戏的${role}。` | 始终 |
| `npcIdentity` | `NPC: ${name}（${role}，${personality}性格）` | 始终 |
| `npcState` | `心情: ${mood}\n需求: ${needs}` | 始终 |
| `npcTraits` | `特质: ${trait1}、${trait2}` | 始终 |
| `relationship` | `与玩家关系: ${label}（${level}）` | 始终 |
| `roomContext` | `地点: ${room}\n物品: ...\n其他人: ...` | 始终 |
| `toolInstructions` | 工具使用规则 | idle_chat / follow_up |
| `outputJson(schema)` | JSON 输出格式 | 需要结构化输出时 |
| `outputFreeText` | 自由文本约束 | 需要自由文本时 |
| `memoriesSection` | NPC 近期记忆 | 有记忆时 |
| `cluesSection` | NPC 已知线索 | 有线索时 |
| `directionsSection` | 对话方向参考 | 有方向时 |
| `summarySection` | 对话历史概要 | 有概要时 |
| `historySection` | 对话历史 | 有历史时 |

### 各对话类型的 Pipeline 定义

```typescript
const PIPELINES: Record<string, PromptStage[]> = {
  idle_chat: [
    persona("NPC扮演"),
    npcIdentity,
    npcState,
    relationship,
    roomContext,
    memoriesSection,
    cluesSection,
    directionsSection,
    summarySection,
    historySection,
    
    toolInstructions,
    outputFreeText,
  ],

  quest_menu: [
    persona("任务对话生成器"),
    npcIdentity,
    relationship,
    questContext,
    outputJson(QuestMenuSchema),
  ],

  quest_trigger: [
    persona("NPC"),
    npcIdentity,
    relationship,
    questContext,
    outputFreeText,
  ],

  quest_deliver: [
    persona("NPC"),
    npcIdentity,
    relationship,
    outputFreeText,
  ],

  functional: [
    persona("NPC"),
    npcIdentity,
    relationship,
    functionalContext,
    outputFreeText,
  ],

  menu_transition: [
    persona("NPC"),
    npcIdentity,
    relationship,
    outputFreeText,
  ],

  trade: [
    persona("NPC对话"),
    npcIdentity,
    npcTraits,
    relationship,
    tradeContext,
    outputFreeText,
  ],

  follow_up: [
    persona("追问选项生成器"),
    npcIdentity,
    npcState,
    relationship,
    toolInstructions,
    outputFreeText,
  ],

  conversation_menu: [
    persona("对话选项生成器"),
    npcIdentity,
    npcState,
    relationship,
    roomContext,
    outputJson(ConversationMenuSchema),
  ],
};
```

### 关键改动对比

| 类型 | 之前 | 之后 |
|------|------|------|
| quest_menu | 无关系 | +relationship |
| quest_trigger | 只有 name+role | +npcIdentity +relationship |
| quest_deliver | 只有 name+role | +npcIdentity +relationship |
| functional | 只有 name+role | +npcIdentity +relationship |
| menu_transition | 只有 name+role | +npcIdentity +relationship |
| trade | 自己算关系（绕过 buildContext） | 统一走 pipeline |
| conversation_menu | 缺 npcState | +npcState |
| idle_chat | 已有（不变） | 结构化为 stage 组合 |

## 测试设计

测试文件：`src/__tests__/prompt-pipeline.test.ts`（新增，~200 行）。

### 测试辅助工具

```typescript
function makePromptContext(overrides?: Partial<PromptContext>): PromptContext {
  return {
    playerName: "赵行舟",
    npcName: "老马",
    npcPersonality: "豪爽",
    npcMood: "平静",
    npcRole: "铁匠",
    npcNeeds: "尊重: 50",
    roomName: "铁匠铺",
    roomDescription: "热浪扑面",
    relationshipLevel: 30,
    relationshipLabel: "普通",
    roomItems: ["铁砧", "锤子"],
    roomNpcs: [],
    npcItems: [{ id: "iron_sword", name: "铁剑" }],
    playerItems: [],
    connectedRooms: ["n→镇广场"],
    npcMemories: [],
    npcKnownClues: [],
    ...overrides,
  };
}
```

### Layer 1：Stage 单元测试（~40 个）

每个 stage 是纯函数 `(ctx) => string | null`。

**输出型 stage**（persona, npcIdentity, npcState, relationship, roomContext）：
验证产出字符串包含期望 key（name/role/level/label 等）。

```typescript
describe("persona stage", () => {
  it("returns the persona declaration", () => {
    const stage = persona("任务对话生成器");
    expect(stage(makePromptContext())).toBe("你是 MUD 游戏的任务对话生成器。");
  });
});

describe("npcIdentity stage", () => {
  it("outputs name, role, and personality", () => {
    const result = npcIdentity(makePromptContext());
    expect(result).toContain("老马");
    expect(result).toContain("铁匠");
    expect(result).toContain("豪爽");
  });
});

describe("relationship stage", () => {
  it("outputs label and numeric level", () => {
    const result = relationship(makePromptContext({ relationshipLevel: 30, relationshipLabel: "普通" }));
    expect(result).toContain("与玩家关系: 普通（30）");
  });
});
```

**null-returning stage**（npcTraits, memoriesSection, cluesSection, directionsSection, summarySection, historySection）：
验证空输入→null，有输入→带期望内容。

```typescript
describe("npcTraits stage", () => {
  it("returns null when no traits", () => {
    const ctx = makePromptContext({ npcItems: [], playerItems: [] });
    // npcTraits 从 npc.traits 读取，不在 makePromptContext 的默认覆盖范围，
    // 需要扩展 context 或直接构造
    expect(npcTraits(makePromptContext())).toBeNull();
  });
});

describe("memoriesSection", () => {
  it("returns null when no memories", () => {
    expect(memoriesSection(makePromptContext({ npcMemories: [] }))).toBeNull();
  });
  it("returns formatted memories when present", () => {
    const result = memoriesSection(makePromptContext({
      npcMemories: ["见过冒险者修剑", "铁矿石涨价"],
    }));
    expect(result).toContain("近期经历");
    expect(result).toContain("见过冒险者修剑");
    expect(result).toContain("铁矿石涨价");
  });
});

// 同样模式: cluesSection, directionsSection, summarySection, historySection
```

### Layer 2：Pipeline 组装测试（~15 个）

```typescript
describe("pipeline assembly", () => {
  const ctx = makePromptContext();

  it("each of the 9 pipelines produces non-empty output", () => {
    for (const [name, stages] of Object.entries(PIPELINES)) {
      const result = assemble(stages, ctx);
      expect(result, `pipeline ${name} returned empty`).toBeTruthy();
    }
  });

  // 验证关系/语气新增
  it("quest_menu includes relationship and tone guidance", () => {
    const result = assemble(PIPELINES.quest_menu, ctx);
    expect(result).toContain("关系");
    expect(result).toContain("语气要求");
  });

  it("quest_trigger includes npcIdentity, relationship, and tone", () => {
    const result = assemble(PIPELINES.quest_trigger, ctx);
    expect(result).toContain("老马");
    expect(result).toContain("铁匠");
    expect(result).toContain("关系");
    expect(result).toContain("语气要求");
  });

  // 同样验证 quest_deliver / functional / menu_transition / trade

  it("trade includes npcTraits", () => {
    const result = assemble(PIPELINES.trade, ctx);
    expect(result).toContain("特质");
  });

  it("conversation_menu includes npcState", () => {
    const result = assemble(PIPELINES.conversation_menu, ctx);
    expect(result).toContain("心情");
  });

  it("null stages don't leave triple blank lines", () => {
    const ctxNoExtras = makePromptContext({ npcMemories: [], npcKnownClues: [] });
    const result = assemble(PIPELINES.idle_chat, ctxNoExtras);
    expect(result).not.toMatch(/\n\n\n/);
  });

  it("persona is always the first line in output", () => {
    for (const stages of Object.values(PIPELINES)) {
      const result = assemble(stages, makePromptContext());
      expect(result.startsWith("你是 MUD 游戏")).toBe(true);
    }
  });
});
```

### Layer 3：间接回归测试

Step 4 每替换一个构建点后跑：

```bash
npx vitest run src/__tests__/dialogue-generator
```

现有 30+ 集成测试覆盖所有 dialogue type 的输入输出契约。prompt 改变但行为不变 → 通过。prompt 损坏（如 JSON schema 丢失导致 LLM 返回格式错误 → fallback 触发）→ 失败。

### Layer 4：idle_chat 新旧对比（手动）

`buildIdleChatPrompt` 是唯一需要手动对比的（最复杂，风险最高）：
- 替换前抓一次完整 system prompt
- 替换后用同 context 跑 pipeline
- verify 所有原始子串仍存在（npcName, npcRole, memories, clues, tool instructions 等）

### 不做

- 无快照测试（全仓库无此模式，不引入新风格）
- 无新的对话行为层面的集成测试（现有测试即回归）
- 不修改 `dialogue-generator.test.ts`（除非删除 `buildDialoguePrompt` 引用）

## 实施步骤

### Step 1: 清除死代码

删除 `buildDialoguePrompt` 旧路径及其所有引用。

- [ ] 删除 `src/llm/prompts/dialogue.ts`（整文件）
- [ ] 删除 `src/llm/dispatcher.ts:339-354`（`generateDialogue()` 方法）
- [ ] 删除 `src/llm/dispatcher.ts:371-373`（`case "dialogue"` 分支）
- [ ] 删除 `src/llm/dispatcher.ts:15`（`buildDialoguePrompt` import）
- [ ] 删除 `src/llm/index.ts:13`（`buildDialoguePrompt` re-export）
- [ ] 删除 `src/__tests__/llm-dispatcher.test.ts` 中 `buildDialoguePrompt` 相关测试（:88-126）

**验证**：
```bash
npx vitest run src/__tests__/llm-dispatcher
```

### Step 2: 实现 pipeline 基础设施

在 `dialogue-generator.ts` 顶部新增：

- `PromptStage` 类型
- `PromptContext` 类型（extends buildContext 返回值）
- `assemble()` 函数
- 14 个 stage 函数（全部遵循：无数据 → 返回 null，不设兜底）
- `PIPELINES` 对象

**验证**：无。Stage 函数此时未被任何代码调用，测试单独覆盖。

### Step 3: 写测试并跑通

实现 `src/__tests__/prompt-pipeline.test.ts`，包含 Layer 1（Stage 单元测试）和 Layer 2（Pipeline 组装测试）。

**验证**：
```bash
npx vitest run src/__tests__/prompt-pipeline
```

### Step 4: 实现 `buildPipelineContext()`

统一从 `buildContext()` + 参数构造 `PromptContext`，替代现有的 `buildMinimalContext()` + 各处散落的 entity 直读。

```typescript
private buildPipelineContext(
  world: WorldState,
  player: Entity,
  npc: NPCEntity,
  taskExtras?: PromptContext['taskExtras'],
): PromptContext {
  return { ...this.buildContext(world, player, npc), taskExtras };
}
```

### Step 5: 逐个替换构建点

按从简到繁的顺序，每替换一个跑一次现有测试。

| 序号 | 构建点 | 替换方式 | 验证 |
|------|--------|----------|------|
| 1 | `generateMenuTransitionDelta` | 用 PIPELINES.menu_transition + assemble() 替代手写 prompt | `npx vitest run src/__tests__/dialogue-generator` |
| 2 | `executeQuestTrigger` | 用 PIPELINES.quest_trigger | 同上 |
| 3 | `executeQuestDeliver` | 用 PIPELINES.quest_deliver | 同上 |
| 4 | `executeFunctional` | 用 PIPELINES.functional | 同上 |
| 5 | `generateTradeReply` | 用 PIPELINES.trade，删除 `getRelation()` 和 traits 的重复计算 | 同上 |
| 6 | `tryGenerateQuestMenu` | 用 PIPELINES.quest_menu | 同上 |
| 7 | `buildConversationMenuPrompt` | 用 PIPELINES.conversation_menu | 同上 |
| 8 | `buildFollowUpOptionsPrompt` | 用 PIPELINES.follow_up | 同上 |
| 9 | `buildIdleChatPrompt` | 用 PIPELINES.idle_chat，手动新旧对比 | 同上 + Layer 4 |

### Step 6: 清理

**删除方法**：
- [ ] 删除 `buildMinimalContext()` 方法（仅剩的引用已在 Step 5 全部替换）
- [ ] 删除 `getRelation()` 方法（仅 trade 使用，已统一到 pipeline）

**删除 11 处硬编码兜底**（均在 `dialogue-generator.ts`）：

| 行号 | 兜底 | 操作 |
|------|------|------|
| :661 | `return "功能"` | 删除，改为 `return null`，调用方处理 null |
| :1370 | `?? "铜币"` | 删除 `?? "铜币"` |
| :1388 | `?? "陌生人"` | 删除，改走 `relationLabelForLevel()` |
| :1394 | `\|\| "无"` | 删除，空列表时 stage 返回 null |
| :1733 `buildMinimalContext` | `?? "居民"` | 随方法删除 |
| :1776 `buildContext` | `?? "普通"` | 删除，personality 为空时传空字符串 |
| :1779 `buildContext` | `?? "未知地点"` | 删除，room 为空时不输出位置 |
| :1788 `buildContext` | `?? "陌生人"` | 删除，改走 `relationLabelForLevel()` |
| :1823 | `\|\| "此前对话概要"` | 删除 `\|\|`，ContentPool 已有该字段 |
| :1972-73 | prompt 模板兜底 | 删除 `\|\|`，ContentPool 已有 `conversationSummaryPrompt` |
| :2306 | `\|\| "平静"` | 删除，`moodLabels` 已提供阈值表 |
| :356-358,927 | `\|\| "无"` ×4 | 删除，空列表时 stage 返回 null |
| :915,2076,2086 | `"告别"` 硬编码 | 改为从 ContentPool 读取（或标记为后续 PR） |

- [ ] 确认无残留引用

### Step 7: 全量验证

```bash
npx vitest run src/__tests__/dialogue-generator
npx vitest run src/__tests__/llm-dispatcher
npx vitest run src/__tests__/prompt-pipeline
npx tsc --noEmit
```

## 影响范围

| 文件 | 操作 | 行数变化 |
|------|------|----------|
| `src/llm/dialogue-generator.ts` | 重构 | +80（stage fn + pipeline）→ -140（删 10 个手写 prompt + buildMinimalContext + getRelation + 11 处硬编码兜底） |
| `src/llm/prompts/dialogue.ts` | 删除 | -63 |
| `src/llm/dispatcher.ts` | 删除 | -30 |
| `src/llm/index.ts` | 删除 re-export | -1 |
| `src/__tests__/prompt-pipeline.test.ts` | 新增 | +200 |
| `src/__tests__/llm-dispatcher.test.ts` | 删除旧测试 | -40 |

- 无 `src/core/types.ts` 变更
- `toneGuidance` 语气配置（涉及 ContentPool `narrativeTemplates` 新增字段）拆为独立方案，不包含在本次重构范围内

## 风险

- **低风险**：stage 函数是纯函数，输入输出可测；13 个 stage 仅依赖 `PromptContext`，无副作用。硬编码兜底消除由 `assemble()` 的 `filter(Boolean)` 兜底，空数据时跳过对应段而非输出假值。
- **中风险**：`buildIdleChatPrompt` 最复杂（conditional sections + tool instructions + conversation history），替换后需手动新旧对比确保 tool-calling 指令不丢失
