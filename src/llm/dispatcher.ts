import type {
  ContentPoolMutation,
  EntityId,
  NPCEntity,
  RegionId,
  RoomId,
  SimulationDelta,
  WorldMutation,
  WorldState,
} from "../core/types.ts";
import { logWrite } from "../shared/log.ts";
import type { LLMAdapter } from "./adapter.ts";
import { parseWorldEventOutput } from "./output-parser.ts";
import { buildContentPoolEvolvePrompt } from "./prompts/content-pool-evolve.ts";
import { buildDialoguePrompt } from "./prompts/dialogue.ts";
import { buildMemoryCompressionPrompt } from "./prompts/memory-compression.ts";
import {
  buildSettlementGrowthPrompt,
  parseSettlementGrowthOutput,
} from "./prompts/settlement-growth.ts";
import { buildWorldEventPrompt } from "./prompts/world-event.ts";
import { generateRoom, getFallbackRoom } from "./room-generator.ts";
import { contentPoolMutationFromToolCalls } from "./tool-mutations.ts";
import { CONTENT_POOL_EVOLVE_TOOLS } from "./tools/content-pool-evolve.ts";

// ============================================================
// 触发信号
// ============================================================

export type InteractionType =
  | "dialogue"
  | "world_event"
  | "memory_compression"
  | "settlement_growth"
  | "content_pool_evolve";

export type Priority = "high" | "medium" | "low";

export interface InteractionRequest {
  id: string;
  type: InteractionType;
  source: EntityId;
  priority: Priority;
  tick: number;
  context: Record<string, unknown>;
}

// ============================================================
// 触发检测（规则层，零 LLM）
// ============================================================

export interface TriggerDetector {
  check(world: WorldState, delta?: SimulationDelta): InteractionRequest[];
}

export function createTriggerDetector(): TriggerDetector {
  return {
    check(world, _delta) {
      const triggers: InteractionRequest[] = [];
      const pool = world.contentPool;
      const cfg = pool.llmTriggerConfig;

      // 1. 世界事件：每结算生成 N 个
      if (cfg.worldEvent.enabled) {
        const labels = pool.narrativeTemplates.regionStatusLabels;
        const hotspots = Array.from(world.regions.values()).map((r) => ({
          region: r.id,
          issue:
            r.prosperity < 40
              ? labels.prosperityLow
              : r.threatLevel > 60
                ? labels.threatHigh
                : labels.stable,
          severity: Math.max(0, Math.min(100, (100 - r.prosperity + r.threatLevel) / 2)),
        }));

        for (let i = 0; i < cfg.worldEvent.perSettlement; i++) {
          const context: Record<string, unknown> = {
            era: pool.calendar.eraName,
            theme: pool.narrativeTemplates.defaultTheme,
            recentEvents: world.eventLog.slice(-5).map((e) => e.title),
            hotspots,
            needTypes: pool.needDefinitions.map((n) => n.type),
            traitKeys: Object.keys(pool.traitLabels),
          };
          triggers.push({
            id: `world_event_${world.tick}_${i}`,
            type: "world_event",
            source: "world" as EntityId,
            priority: "medium",
            tick: world.tick,
            context,
          });
        }
      }

      // 2. 记忆压缩：最多 N 个 NPC
      if (cfg.memoryCompression.enabled) {
        const candidates = Array.from(world.entities.values())
          .filter((e): e is NPCEntity => e.type === "npc" && e.npcTier !== "background")
          .filter(
            (npc) =>
              npc.memories.filter((m) => m.tick > world.tick - 30).length >
              cfg.memoryCompression.minMemoriesToTrigger,
          )
          .sort((a, b) => b.memories.length - a.memories.length)
          .slice(0, cfg.memoryCompression.maxCandidates);

        for (const npc of candidates) {
          triggers.push({
            id: `memory_compress_${npc.id}_${world.tick}`,
            type: "memory_compression",
            source: npc.id,
            priority: "low",
            tick: world.tick,
            context: { npc, traitKeys: Object.keys(pool.traitLabels) },
          });
        }
      }

      // 3. 聚落生长检测
      if (cfg.settlementGrowth.enabled) {
        for (const [regionId, region] of world.regions) {
          const regionNPCs = Array.from(world.entities.values())
            .filter((e) => e.type === "npc")
            .filter((e) => e.roomId && world.rooms.get(e.roomId)?.regionId === regionId);
          const regionRooms = Array.from(world.rooms.values()).filter(
            (r) => r.regionId === regionId,
          );

          const npcCount = regionNPCs.length;
          const roomCount = regionRooms.length;
          const growth = cfg.settlementGrowth;
          if (
            npcCount > roomCount * growth.npcToRoomRatio ||
            (region.prosperity > growth.prosperityThreshold &&
              region.threatLevel < growth.threatThreshold)
          ) {
            triggers.push({
              id: `settlement_growth_${regionId}_${world.tick}`,
              type: "settlement_growth",
              source: regionId as EntityId,
              priority: "medium",
              tick: world.tick,
              context: {
                region: {
                  id: regionId,
                  name: region.name,
                  population: npcCount,
                  prosperity: region.prosperity,
                },
                existingRooms: regionRooms.map((r) => ({
                  id: r.id,
                  name: r.name,
                  exits: Object.fromEntries(r.exits),
                })),
                growthReason:
                  region.prosperity > growth.prosperityThreshold ? "经济繁荣" : "人口增长",
                npcsToRelocate: regionNPCs.slice(0, 3).map((n) => ({
                  id: n.id,
                  name: n.name,
                  currentRoom: n.roomId ?? "",
                })),
              },
            });
          }
        }
      }

      // 4. ContentPool 演化
      if (cfg.contentPoolEvolve.enabled) {
        if (
          world.time.day === cfg.contentPoolEvolve.checkDay &&
          world.time.month > 0 &&
          world.round > 0
        ) {
          triggers.push({
            id: `content_pool_evolve_${world.tick}`,
            type: "content_pool_evolve",
            source: "world" as EntityId,
            priority: "low",
            tick: world.tick,
            context: {
              era: pool.calendar.eraName,
              existingNeeds: pool.needDefinitions.map((n) => n.type),
              existingTraitLabels: Object.keys(pool.traitLabels),
              existingActions: pool.actionEffects.map((a) => a.action),
              existingRoles: pool.scheduleTemplates.map((t) => t.role),
              existingCultures: pool.roomTemplates.map((t) => t.culture),
              previousRoomTemplateCultures: pool.roomTemplates.map((t) => t.culture),
            },
          });
        }
      }

      return triggers;
    },
  };
}

// ============================================================
// 调度器
// ============================================================

export interface DispatcherConfig {
  maxBatchSize: number;
}

export interface ExecuteResult {
  delta: SimulationDelta | null;
  worldMutation: WorldMutation | null;
  contentPoolMutation: ContentPoolMutation | null;
}

function emptyResult(): ExecuteResult {
  return { delta: null, worldMutation: null, contentPoolMutation: null };
}

export interface SettlementBatchResult {
  deltas: SimulationDelta[];
  worldMutations: WorldMutation[];
  contentPoolMutations: ContentPoolMutation[];
}

export class InteractionDispatcher {
  private adapter: LLMAdapter;
  private settlementAdapter?: LLMAdapter;
  private detector: TriggerDetector;
  private config: DispatcherConfig;
  public reachable = false;

  constructor(adapter: LLMAdapter, config?: Partial<DispatcherConfig>) {
    this.adapter = adapter;
    this.detector = createTriggerDetector();
    this.config = { maxBatchSize: 10, ...config };
  }

  getAdapter(): LLMAdapter {
    return this.adapter;
  }

  setSettlementAdapter(adapter: LLMAdapter): void {
    this.settlementAdapter = adapter;
  }

  getSettlementAdapter(): LLMAdapter | undefined {
    return this.settlementAdapter;
  }

  async checkReachable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.adapter.getBaseUrl()}/models`, {
        headers: { Authorization: `Bearer ${this.adapter.getApiKey()}` },
        signal: AbortSignal.timeout(5000),
      });
      this.reachable = resp.ok;
      return resp.ok;
    } catch {
      this.reachable = false;
      return false;
    }
  }

  async runSettlementBatch(
    world: WorldState,
    delta?: SimulationDelta,
  ): Promise<SettlementBatchResult> {
    if (!this.reachable) return { deltas: [], worldMutations: [], contentPoolMutations: [] };

    const activeAdapter = this.settlementAdapter ?? this.adapter;

    const triggers = this.detector.check(world, delta);
    const deltas: SimulationDelta[] = [];
    const worldMutations: WorldMutation[] = [];
    const contentPoolMutations: ContentPoolMutation[] = [];

    const batches = this.partition(triggers, this.config.maxBatchSize);
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map((req) => this.execute(world, req, activeAdapter)),
      );
      for (const result of batchResults) {
        if (result.delta) deltas.push(result.delta);
        if (result.worldMutation) worldMutations.push(result.worldMutation);
        if (result.contentPoolMutation) contentPoolMutations.push(result.contentPoolMutation);
      }
    }

    return { deltas, worldMutations, contentPoolMutations };
  }

  async runEncounter(
    world: WorldState,
    request: InteractionRequest,
  ): Promise<SimulationDelta | null> {
    if (!this.reachable) return null;
    const result = await this.execute(world, request);
    return result.delta;
  }

  async exploreRoom(
    world: WorldState,
    params: { fromRoomId: RoomId; direction: string; regionId: RegionId },
  ): Promise<WorldMutation | null> {
    try {
      const mutation = await generateRoom(this.adapter, world, params);
      if (mutation) return mutation;
    } catch (err) {
      console.warn("[Dispatcher] exploreRoom LLM failed, using fallback:", err);
    }
    return getFallbackRoom(world, params);
  }
  async generateDialogue(context: {
    speaker: { name: string; personality: string; mood: string; role?: string };
    listener: { name: string };
    relationship: { level: number };
    room: string;
    trigger: string;
    memories: string[];
  }): Promise<string | null> {
    try {
      const { system, user } = buildDialoguePrompt(context);
      const response = await this.adapter.chat(system, user, undefined, undefined, "dialogue");
      return response.text.trim();
    } catch {
      return null;
    }
  }

  private async execute(
    _world: WorldState,
    request: InteractionRequest,
    adapter?: LLMAdapter,
  ): Promise<ExecuteResult> {
    const llm = adapter ?? this.adapter;
    try {
      switch (request.type) {
        case "world_event": {
          // biome-ignore lint/suspicious/noExplicitAny: context 类型安全，由 trigger detector 保证
          const { system, user } = buildWorldEventPrompt(request.context as any);
          const response = await llm.chat(system, user, undefined, undefined, "world_event");
          return { ...emptyResult(), delta: parseWorldEventOutput(response.text) };
        }

        case "dialogue": {
          return emptyResult();
        }

        case "memory_compression": {
          // biome-ignore lint/suspicious/noExplicitAny: context 类型安全，由 trigger detector 保证
          const { system, user } = buildMemoryCompressionPrompt(request.context as any);
          const response = await llm.chat(system, user, undefined, undefined, "memory_compression");
          return { ...emptyResult(), delta: parseWorldEventOutput(response.text) };
        }

        case "settlement_growth": {
          // biome-ignore lint/suspicious/noExplicitAny: context 类型安全，由 trigger detector 保证
          const { system, user } = buildSettlementGrowthPrompt(request.context as any);
          const response = await llm.chat(system, user, undefined, undefined, "settlement_growth");
          const mutation = await parseSettlementGrowthOutput(response.text);
          if (mutation) {
            logWrite("srv", "info", "[SettlementGrowth] parsed mutation for later materialization");
            return { ...emptyResult(), worldMutation: mutation };
          }
          return emptyResult();
        }

        case "content_pool_evolve": {
          // biome-ignore lint/suspicious/noExplicitAny: context 类型安全，由 trigger detector 保证
          const { system, user } = buildContentPoolEvolvePrompt(request.context as any);
          const response = await llm.chat(
            system,
            user,
            CONTENT_POOL_EVOLVE_TOOLS,
            "auto",
            "content_pool_evolve",
          );
          const toolMutation = contentPoolMutationFromToolCalls(response.toolCalls);
          if (toolMutation) {
            logWrite("srv", "info", "[ContentPoolEvolve] parsed tool mutation");
            return { ...emptyResult(), contentPoolMutation: toolMutation };
          }
          const match =
            response.text.match(/```json\n?([\s\S]*?)\n?```/) ??
            response.text.match(/(\{[\s\S]*\})/);
          if (match) {
            const mutation = JSON.parse(match[1] ?? match[0]);
            logWrite("srv", "info", "[ContentPoolEvolve] parsed mutation for later application");
            return { ...emptyResult(), contentPoolMutation: mutation as ContentPoolMutation };
          }
          return emptyResult();
        }

        default:
          return emptyResult();
      }
    } catch (err) {
      console.error(`LLM dispatch failed for ${request.type}:`, err);
      return emptyResult();
    }
  }

  private partition<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }
}
