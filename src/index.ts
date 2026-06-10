import "dotenv/config";
import { EventBus } from "./core/event-bus";
import { createDailyRoutineMemory } from "./core/memory.ts";
import { RoundEngine } from "./core/round-engine";
import type { NPCEntity, SimulationDelta, WorldState } from "./core/types";
import { applyDelta } from "./core/world";
import { loadWorldFromYaml } from "./core/world-loader";
import { executeEntityAction } from "./engine/act-loop.ts";
import { resolveActionEffect } from "./engine/command-executor.ts";
import { DialogueGenerator } from "./llm/dialogue-generator.ts";
import { InteractionDispatcher, LLMAdapter } from "./llm/index";
import { GameServer } from "./server/ws-server";
import { hookEventLog, logCommand, logSnapshot, logWrite } from "./shared/log.ts";
import { decayNeeds } from "./simulation/index";

async function main() {
  const worldFile = process.env.WORLD_FILE ?? "worlds/generated_continent.yaml";
  const world = loadWorldFromYaml(worldFile);
  hookEventLog(world);
  const eventBus = new EventBus();

  const simulation = {
    runDay(world: WorldState, _playerActions: unknown[]): SimulationDelta {
      for (const [id, entity] of world.entities) {
        if (entity.type !== "npc" && entity.type !== "player") continue;
        const e = entity as NPCEntity;

        // 每小时遍历 schedule，通过 act-loop 执行（ripple 生效，不创建单次记忆）
        for (let hour = 6; hour <= 22; hour++) {
          const schedule = e.schedule ?? [];
          const entry = schedule.find((s) => hour >= s.startHour && hour < s.endHour);
          if (!entry) continue;

          // 从 ContentPool 查 actionEffect
          const effect = world.contentPool.actionEffects.find((a) => a.action === entry.action);
          let actionDelta: SimulationDelta = {};
          if (effect) {
            actionDelta = resolveActionEffect(id, world.contentPool, entry.action);
          }

          // 通过 act-loop：ripple（如社会行为有信号）+ compose + apply
          executeEntityAction({
            world,
            actorId: id,
            action: entry.action,
            actionDelta,
            actionEvents: [],
            options: { roomId: entity.roomId ?? undefined, createMemory: false },
          });
        }

        // 每日需求衰减
        const decayDelta = decayNeeds(id, e);
        applyDelta(world, decayDelta);

        // 每日例行记忆汇总
        if (e.type === "npc") {
          createDailyRoutineMemory(e as NPCEntity, world.tick, world);
        }
      }
      return {};
    },
  };

  const llmAdapter = new LLMAdapter({
    baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
    apiKey: process.env.LLM_API_KEY ?? "ollama",
    model: process.env.LLM_MODEL ?? "llama3",
  });
  const dispatcher = new InteractionDispatcher(llmAdapter);

  const engine = new RoundEngine(world, eventBus, dispatcher, simulation);

  const serverPort = Number(process.env.WORLD_SERVER_PORT ?? 3000);
  const server = new GameServer(serverPort, world, eventBus);

  // Immediate command execution
  server.setCommandHandler(async (playerId, action, params) => {
    logCommand(playerId, action, world.round);
    logWrite(
      "srv",
      "info",
      `[Round ${world.round}] ${playerId}: ${action} ${JSON.stringify(params)}`,
    );
    const cmdResult = await engine.executeStructuredCommand(playerId, action, params);
    return cmdResult;
  });

  const dialogueGenerator = new DialogueGenerator(
    new LLMAdapter({
      baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
      apiKey: process.env.LLM_API_KEY ?? "ollama",
      model: process.env.LLM_DIALOGUE_MODEL ?? process.env.LLM_MODEL ?? "llama3",
      disableThinking: true,
    }),
  );
  engine.setDialogueGenerator(dialogueGenerator);

  server.setDialogueOptionsHandler(async (playerId, npcId) => {
    return dialogueGenerator.generateFixedMenu(world, playerId, npcId);
  });

  // Game loop: when all players end their day, settle
  const gameLoop = engine.startLoop({
    getPlayerIds: () => server.getConnectedPlayerIds(),
    onRoundStart: (round) => {
      logWrite("srv", "info", `Round ${round} start`);
      server.broadcastStatus(dispatcher.reachable);
    },
    onSettlementStarted: () => {
      server.broadcastSettlementStarted();
    },
    onReportReady: (reports) => {
      server.broadcastReport(reports);
      logSnapshot(world);
      logWrite("srv", "info", `Round ${world.round} settled: ${reports.size} reports sent`);
    },
    onActionResult: (_playerId, _event) => {
      // Individual event push handled via command_result in server
    },
  });

  logWrite(
    "srv",
    "info",
    `ContentPool: ${world.contentPool.needDefinitions.length} needs, ${world.contentPool.actionEffects.length} effects`,
  );
  logWrite("srv", "info", `World: ${world.rooms.size} rooms, ${world.entities.size} entities`);
  logWrite("srv", "info", `WebSocket on ws://localhost:${serverPort}`);

  dispatcher.checkReachable().then((ok) => {
    logWrite("srv", "info", `LLM: ${ok ? "reachable" : "unreachable"}`);
    server.broadcastStatus(ok);
  });

  await gameLoop;
}

try {
  await main();
} catch (e) {
  logWrite("srv", "info", `FATAL: ${String(e)}`);
}
