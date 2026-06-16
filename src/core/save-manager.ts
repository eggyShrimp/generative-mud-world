import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { logWrite } from "../shared/log.ts";
import type { SaveSlotInfo } from "../shared/protocol.ts";
import { SaveDataSchema } from "./schemas/index.ts";
import type { SaveData, SaveMeta, WorldState } from "./types";

const DEFAULT_SAVES_DIR = "saves";

export interface SaveLoadOptions {
  rootDir?: string;
  slotId: string;
  worldId: string;
  currentTick?: number;
  currentRound?: number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function emptySaveData(slotId: string, worldId: string, tick: number, round: number): SaveData {
  return {
    version: 1,
    meta: {
      slotId,
      worldId,
      savedAt: nowSeconds(),
      gameTick: tick,
      round,
    },
    conversations: {
      summaries: {},
    },
    weatherByRegion: {},
  };
}

function cloneSaveData(data: SaveData): SaveData {
  return JSON.parse(JSON.stringify(data)) as SaveData;
}

function conversationKey(playerId: string, npcId: string): string {
  return `${playerId}:${npcId}`;
}

function migrateSaveData(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const data = raw as Record<string, unknown>;
  if (data.version === undefined) {
    return { ...data, version: 1 };
  }
  return data;
}

export class ConversationSaveDao {
  readonly #getData: () => SaveData;

  constructor(getData: () => SaveData) {
    this.#getData = getData;
  }

  getSummary(playerId: string, npcId: string): string | null {
    const entries = this.#getData().conversations.summaries[conversationKey(playerId, npcId)];
    if (!entries || entries.length === 0) return null;
    return entries[entries.length - 1].summary;
  }

  setSummary(playerId: string, npcId: string, summary: string, tick: number): void {
    const data = this.#getData();
    const key = conversationKey(playerId, npcId);
    const entries = data.conversations.summaries[key] ?? [];
    entries.push({ summary, lastTick: tick });
    data.conversations.summaries[key] = entries;
  }
}

export class SaveManager {
  #data: SaveData;
  readonly #rootDir: string;
  readonly #slotId: string;
  readonly conversations: ConversationSaveDao;

  private constructor(data: SaveData, rootDir: string) {
    this.#data = data;
    this.#rootDir = rootDir;
    this.#slotId = data.meta.slotId;
    this.conversations = new ConversationSaveDao(() => this.#data);
  }

  get data(): SaveData {
    return cloneSaveData(this.#data);
  }

  static load(slotId: string, worldId: string): SaveManager;
  static load(options: SaveLoadOptions): SaveManager;
  static load(optionsOrSlotId: SaveLoadOptions | string, maybeWorldId?: string): SaveManager {
    const options =
      typeof optionsOrSlotId === "string"
        ? {
            slotId: optionsOrSlotId,
            worldId: maybeWorldId ?? "default",
            rootDir: DEFAULT_SAVES_DIR,
            currentTick: 0,
            currentRound: 0,
          }
        : {
            rootDir: DEFAULT_SAVES_DIR,
            currentTick: 0,
            currentRound: 0,
            ...optionsOrSlotId,
          };
    const filePath = join(options.rootDir, `${options.slotId}.json`);

    if (!existsSync(filePath)) {
      logWrite("srv", "info", `SaveManager: slot "${options.slotId}" not found, creating new save`);
      return SaveManager.create({
        rootDir: options.rootDir,
        slotId: options.slotId,
        worldId: options.worldId,
        currentTick: options.currentTick,
        currentRound: options.currentRound,
      });
    }

    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = migrateSaveData(JSON.parse(raw));
      const result = SaveDataSchema.safeParse(parsed);

      if (!result.success) {
        logWrite(
          "srv",
          "warn",
          `SaveManager: slot "${options.slotId}" validation failed: ${result.error.message}, creating new save`,
        );
        return SaveManager.create(options);
      }

      const data = result.data;
      if (data.meta.worldId !== options.worldId) {
        logWrite(
          "srv",
          "warn",
          `SaveManager: slot "${options.slotId}" world mismatch (expected ${options.worldId}, got ${data.meta.worldId}), creating new save`,
        );
        return SaveManager.create(options);
      }
      if (data.meta.slotId !== options.slotId) {
        logWrite(
          "srv",
          "warn",
          `SaveManager: slot "${options.slotId}" meta mismatch (expected ${options.slotId}, got ${data.meta.slotId}), using file's slotId`,
        );
      }

      logWrite(
        "srv",
        "info",
        `SaveManager: loaded slot "${options.slotId}" (tick ${data.meta.gameTick}, round ${data.meta.round})`,
      );
      return new SaveManager(data, options.rootDir);
    } catch (err) {
      logWrite(
        "srv",
        "warn",
        `SaveManager: failed to load slot "${options.slotId}": ${String(err)}, creating new save`,
      );
      return SaveManager.create(options);
    }
  }

  static create(slotId: string, worldId: string, tick: number, round: number): SaveManager;
  static create(options: SaveLoadOptions): SaveManager;
  static create(
    optionsOrSlotId: SaveLoadOptions | string,
    maybeWorldId?: string,
    maybeTick = 0,
    maybeRound = 0,
  ): SaveManager {
    const options =
      typeof optionsOrSlotId === "string"
        ? {
            rootDir: DEFAULT_SAVES_DIR,
            slotId: optionsOrSlotId,
            worldId: maybeWorldId ?? "default",
            currentTick: maybeTick,
            currentRound: maybeRound,
          }
        : {
            rootDir: DEFAULT_SAVES_DIR,
            currentTick: 0,
            currentRound: 0,
            ...optionsOrSlotId,
          };
    return new SaveManager(
      emptySaveData(
        options.slotId,
        options.worldId,
        options.currentTick ?? 0,
        options.currentRound ?? 0,
      ),
      options.rootDir,
    );
  }

  static listSlots(rootDir = DEFAULT_SAVES_DIR): string[] {
    if (!existsSync(rootDir)) return [];
    return readdirSync(rootDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  }

  static createSlot(options: SaveLoadOptions): SaveSlotInfo {
    const manager = SaveManager.create(options);
    manager.save();
    return manager.toSlotInfo();
  }

  listSlots(): SaveSlotInfo[] {
    return SaveManager.listSlots(this.#rootDir)
      .map((slotId) => this.readSlotInfo(slotId))
      .filter((slot): slot is SaveSlotInfo => slot !== null)
      .sort((a, b) => b.savedAt - a.savedAt || a.slotId.localeCompare(b.slotId));
  }

  save(): void {
    if (!existsSync(this.#rootDir)) {
      mkdirSync(this.#rootDir, { recursive: true });
    }

    this.#data.meta.savedAt = nowSeconds();

    this.writeData(this.#slotId, this.#data);
  }

  saveAs(slotId: string, world: WorldState): SaveSlotInfo {
    const data = cloneSaveData(this.#data);
    data.meta = {
      ...data.meta,
      slotId,
      savedAt: nowSeconds(),
      gameTick: world.tick,
      round: world.round,
    };
    this.writeData(slotId, data);
    return this.buildSlotInfo(data, slotId === this.#slotId, true);
  }

  private writeData(slotId: string, data: SaveData): void {
    if (!existsSync(this.#rootDir)) {
      mkdirSync(this.#rootDir, { recursive: true });
    }

    const filePath = join(this.#rootDir, `${slotId}.json`);
    const tmpPath = join(this.#rootDir, `.${slotId}.tmp`);

    const json = `${JSON.stringify(data, null, 2)}\n`;

    writeFileSync(tmpPath, json, "utf-8");
    renameSync(tmpPath, filePath);
  }

  capture(world: WorldState): void {
    this.updateMeta(world.tick, world.round);
    if (world.weatherByRegion) {
      this.#data.weatherByRegion = Object.fromEntries(world.weatherByRegion);
    }
  }

  restore(world: WorldState): void {
    world.weatherByRegion = new Map(Object.entries(this.#data.weatherByRegion));
  }

  getMeta(): SaveMeta {
    return { ...this.#data.meta };
  }

  toSlotInfo(): SaveSlotInfo {
    return this.buildSlotInfo(this.#data, true, true);
  }

  updateMeta(tick: number, round: number): void {
    this.#data.meta.gameTick = tick;
    this.#data.meta.round = round;
  }

  getConversationSummary(playerId: string, npcId: string): string | null {
    return this.conversations.getSummary(playerId, npcId);
  }

  setConversationSummary(playerId: string, npcId: string, summary: string, tick: number): void {
    this.conversations.setSummary(playerId, npcId, summary, tick);
  }

  private readSlotInfo(slotId: string): SaveSlotInfo | null {
    try {
      const raw = readFileSync(join(this.#rootDir, `${slotId}.json`), "utf-8");
      const parsed = JSON.parse(raw);
      const result = SaveDataSchema.safeParse(parsed);
      if (!result.success) {
        return {
          slotId,
          worldId: "",
          savedAt: 0,
          gameTick: 0,
          round: 0,
          version: 0,
          isCurrent: slotId === this.#slotId,
          summaryCount: 0,
          valid: false,
        };
      }
      return this.buildSlotInfo(result.data, slotId === this.#slotId, true);
    } catch {
      return {
        slotId,
        worldId: "",
        savedAt: 0,
        gameTick: 0,
        round: 0,
        version: 0,
        isCurrent: slotId === this.#slotId,
        summaryCount: 0,
        valid: false,
      };
    }
  }

  private buildSlotInfo(data: SaveData, isCurrent: boolean, valid: boolean): SaveSlotInfo {
    return {
      slotId: data.meta.slotId,
      worldId: data.meta.worldId,
      savedAt: data.meta.savedAt,
      gameTick: data.meta.gameTick,
      round: data.meta.round,
      version: data.version,
      isCurrent,
      summaryCount: Object.values(data.conversations.summaries).reduce(
        (sum, entries) => sum + entries.length,
        0,
      ),
      valid,
    };
  }
}
