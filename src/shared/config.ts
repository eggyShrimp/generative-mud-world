import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────

const LLMPartialSchema = z.object({
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  apiKey: z.string().nullable(),
});

export const ConfigSchema = z.object({
  server: z.object({
    port: z.number().int().min(1).max(65535),
  }),
  llm: z.object({
    baseUrl: z.string(),
    apiKey: z.string(),
    model: z.string(),
    dialogue: LLMPartialSchema,
    settlement: LLMPartialSchema,
    worldGeneration: LLMPartialSchema,
  }),
  world: z.object({
    file: z.string(),
  }),
  save: z.object({
    dir: z.string(),
    selectMode: z.string(),
    defaultSlot: z.string(),
  }),
  log: z.object({
    file: z.string().nullable(),
    level: z.string(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

// ── Defaults ────────────────────────────────────────────────────

const partialDefault = { model: null, baseUrl: null, apiKey: null };

const DEFAULTS: Config = {
  server: { port: 3000 },
  llm: {
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    model: "deepseek-chat",
    dialogue: { ...partialDefault },
    settlement: { ...partialDefault },
    worldGeneration: { ...partialDefault },
  },
  world: { file: "worlds/generated_continent.yaml" },
  save: { dir: "saves", selectMode: "skip", defaultSlot: "slot_001" },
  log: { file: null, level: "ws" },
};

// ── Helpers ─────────────────────────────────────────────────────

function setNested(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i] ?? "";
    if (typeof cur[key] !== "object" || cur[key] === null) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  const lastKey = keys[keys.length - 1] ?? "";
  cur[lastKey] = value;
}

function deepMerge(base: Record<string, unknown>, overrides: Record<string, unknown>): void {
  for (const [key, val] of Object.entries(overrides)) {
    if (val === undefined || val === null || val === "") continue;
    if (
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof base[key] === "object" &&
      base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      deepMerge(base[key] as Record<string, unknown>, val as Record<string, unknown>);
    } else {
      base[key] = val;
    }
  }
}

function loadConfigFile(): Record<string, unknown> {
  try {
    const raw = readFileSync("world.config.yaml", "utf-8");
    return (parseYaml(raw) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

function collectEnvOverrides(): Record<string, unknown> {
  const o: Record<string, unknown> = {};

  // server
  if (process.env.WORLD_SERVER_PORT)
    setNested(o, "server.port", Number(process.env.WORLD_SERVER_PORT));
  // llm — top-level
  if (process.env.LLM_BASE_URL) setNested(o, "llm.baseUrl", process.env.LLM_BASE_URL);
  if (process.env.LLM_API_KEY) setNested(o, "llm.apiKey", process.env.LLM_API_KEY);
  if (process.env.LLM_MODEL) setNested(o, "llm.model", process.env.LLM_MODEL);
  // llm — dialogue
  if (process.env.LLM_DIALOGUE_MODEL)
    setNested(o, "llm.dialogue.model", process.env.LLM_DIALOGUE_MODEL);
  if (process.env.LLM_DIALOGUE_BASE_URL)
    setNested(o, "llm.dialogue.baseUrl", process.env.LLM_DIALOGUE_BASE_URL);
  if (process.env.LLM_DIALOGUE_API_KEY)
    setNested(o, "llm.dialogue.apiKey", process.env.LLM_DIALOGUE_API_KEY);
  // llm — settlement
  if (process.env.LLM_SETTLEMENT_MODEL)
    setNested(o, "llm.settlement.model", process.env.LLM_SETTLEMENT_MODEL);
  if (process.env.LLM_SETTLEMENT_BASE_URL)
    setNested(o, "llm.settlement.baseUrl", process.env.LLM_SETTLEMENT_BASE_URL);
  if (process.env.LLM_SETTLEMENT_API_KEY)
    setNested(o, "llm.settlement.apiKey", process.env.LLM_SETTLEMENT_API_KEY);
  // llm — worldGeneration
  if (process.env.LLM_WORLD_GENERATION_MODEL)
    setNested(o, "llm.worldGeneration.model", process.env.LLM_WORLD_GENERATION_MODEL);
  if (process.env.LLM_WORLD_GENERATION_BASE_URL)
    setNested(o, "llm.worldGeneration.baseUrl", process.env.LLM_WORLD_GENERATION_BASE_URL);
  if (process.env.LLM_WORLD_GENERATION_API_KEY)
    setNested(o, "llm.worldGeneration.apiKey", process.env.LLM_WORLD_GENERATION_API_KEY);
  // world
  if (process.env.WORLD_FILE) setNested(o, "world.file", process.env.WORLD_FILE);
  // save
  if (process.env.SAVE_DIR) setNested(o, "save.dir", process.env.SAVE_DIR);
  if (process.env.SAVE_SELECT) setNested(o, "save.selectMode", process.env.SAVE_SELECT);
  if (process.env.SAVE_SLOT) setNested(o, "save.defaultSlot", process.env.SAVE_SLOT);
  // log
  if (process.env.WORLD_LOG_FILE) setNested(o, "log.file", process.env.WORLD_LOG_FILE);
  if (process.env.WORLD_LOG_LEVEL) setNested(o, "log.level", process.env.WORLD_LOG_LEVEL);

  return o;
}

// ── Init ────────────────────────────────────────────────────────

const merged: Record<string, unknown> = structuredClone(DEFAULTS) as unknown as Record<
  string,
  unknown
>;
deepMerge(merged, loadConfigFile());
deepMerge(merged, collectEnvOverrides());

const parsed = ConfigSchema.safeParse(merged);
if (!parsed.success) {
  process.stderr.write(`[config] 配置校验失败:\n${parsed.error.format()}\n`);
  process.exit(1);
}

export const config: Config = parsed.data;

export const wsUrl = process.env.WORLD_WS_URL ?? `ws://localhost:${config.server.port}`;

// ── LLM helper ──────────────────────────────────────────────────

export type LLMRole = "default" | "dialogue" | "settlement" | "worldGeneration";

export function getLLMConfig(
  role: LLMRole,
  opts?: { disableThinking?: boolean },
): { baseUrl: string; apiKey: string; model: string; disableThinking?: boolean } {
  const override = role === "default" ? null : config.llm[role];
  return {
    baseUrl: override?.baseUrl ?? config.llm.baseUrl,
    apiKey: override?.apiKey ?? config.llm.apiKey,
    model: override?.model ?? config.llm.model,
    disableThinking: opts?.disableThinking,
  };
}
