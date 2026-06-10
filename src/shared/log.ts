import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type LogSource = "srv" | "cli";
export type LogLevel = "info" | "warn" | "evt" | "perf" | "ws" | "key" | "dbg";

const LEVEL_ORDER: Record<LogLevel, number> = {
  info: 0,
  warn: 0,
  evt: 1,
  perf: 1,
  ws: 2,
  key: 3,
  dbg: 4,
};

const LOG_DIR = join(homedir(), ".config", "world-client");
const LOG_FILE = process.env.WORLD_LOG_FILE ?? join(LOG_DIR, "world.log");
const LOG_LEVEL: LogLevel = (process.env.WORLD_LOG_LEVEL as LogLevel) ?? "ws";
const MAX_LEVEL = LEVEL_ORDER[LOG_LEVEL] ?? LEVEL_ORDER.ws;

const STRUCTURED_LOG_DIR = "logs";

function logStderr(tag: string, msg: string): void {
  process.stderr.write(`[world:${tag}] ${msg}\n`);
}

try {
  mkdirSync(LOG_DIR, { recursive: true });
} catch (err) {
  logStderr("warn", `无法创建日志目录 ${LOG_DIR}: ${String(err)}`);
}

function ensureStructuredDir(): string {
  try {
    if (!existsSync(STRUCTURED_LOG_DIR)) mkdirSync(STRUCTURED_LOG_DIR, { recursive: true });
  } catch (err) {
    logStderr("warn", `无法创建结构化日志目录: ${String(err)}`);
  }
  return STRUCTURED_LOG_DIR;
}

export function logWrite(src: LogSource, level: LogLevel, msg: string): void {
  if ((LEVEL_ORDER[level] ?? 0) > MAX_LEVEL) return;
  try {
    const ts = new Date().toISOString().slice(11, 23);
    const line = `[${ts}] [${src}] ${level.padEnd(4)} ${msg}\n`;
    appendFileSync(LOG_FILE, line);
  } catch (err) {
    logStderr("err", `日志写入失败: ${String(err)}`);
  }
}

// ─── 结构化日志（JSON，用于调试/回溯/重放）───────────────────

interface WorldEventRecord {
  tick: number;
  type: string;
  title: string;
  description: string;
  scope: string;
  source: string;
  data: Record<string, unknown>;
}

export function logWorldEvent(event: WorldEventRecord): void {
  try {
    const dir = ensureStructuredDir();
    const line = JSON.stringify({
      tick: event.tick,
      type: event.type,
      title: event.title,
      description: event.description,
      scope: event.scope,
      source: event.source,
      data: event.data,
    });
    appendFileSync(join(dir, "events.log"), `${line}\n`);
  } catch (err) {
    logStderr("err", `事件日志写入失败: ${String(err)}`);
  }
}

export function logCommand(playerId: string, action: string, round: number): void {
  try {
    const dir = ensureStructuredDir();
    const entry = JSON.stringify({
      round,
      playerId,
      action,
      timestamp: new Date().toISOString(),
    });
    appendFileSync(join(dir, "commands.log"), `${entry}\n`);
  } catch (err) {
    logStderr("err", `命令日志写入失败: ${String(err)}`);
  }
}

interface SnapshotInput {
  round: number;
  tick: number;
  time: { tick: number; hour: number; day: number };
  entities: Map<string, { id: string; name: string; type: string; roomId: string | null }>;
  eventLog: unknown[];
  getNeeds?: (id: string) => Array<{ type: string; value: number }>;
}

export function logSnapshot(world: SnapshotInput): void {
  try {
    const dir = ensureStructuredDir();
    const snapshot = {
      round: world.round,
      tick: world.tick,
      time: world.time,
      entityCount: world.entities.size,
      entities: Array.from(world.entities.values()).map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        roomId: e.roomId,
      })),
      eventCount: world.eventLog.length,
    };
    appendFileSync(
      join(dir, `snapshot_r${world.round.toString().padStart(4, "0")}.json`),
      `${JSON.stringify(snapshot, null, 2)}\n`,
    );
  } catch (err) {
    logStderr("err", `快照写入失败: ${String(err)}`);
  }
}

/**
 * Hook world.eventLog.push，自动将 WorldEvent 持久化到 logs/events.log
 */
export function hookEventLog(world: { eventLog: WorldEventRecord[] }): void {
  const originalPush = world.eventLog.push.bind(world.eventLog);
  world.eventLog.push = (...items: WorldEventRecord[]) => {
    for (const item of items) {
      logWorldEvent(item);
    }
    return originalPush(...items);
  };
}
