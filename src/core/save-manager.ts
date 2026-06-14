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
import { SaveDataSchema } from "./schemas/index.ts";
import type { SaveData, SaveMeta } from "./types";

const SAVES_DIR = "saves";

export class SaveManager {
  #data: SaveData;
  readonly #slotId: string;

  private constructor(data: SaveData) {
    this.#data = data;
    this.#slotId = data.meta.slotId;
  }

  get data(): SaveData {
    return this.#data;
  }

  static load(slotId: string, worldId: string): SaveManager {
    const filePath = join(SAVES_DIR, `${slotId}.json`);

    if (!existsSync(filePath)) {
      logWrite("srv", "info", `SaveManager: slot "${slotId}" not found, creating new save`);
      return SaveManager.create(slotId, worldId, 0, 0);
    }

    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const result = SaveDataSchema.safeParse(parsed);

      if (!result.success) {
        logWrite(
          "srv",
          "warn",
          `SaveManager: slot "${slotId}" validation failed: ${result.error.message}, creating new save`,
        );
        return SaveManager.create(slotId, worldId, 0, 0);
      }

      const data = result.data;
      if (data.meta.slotId !== slotId) {
        logWrite(
          "srv",
          "warn",
          `SaveManager: slot "${slotId}" meta mismatch (expected ${slotId}, got ${data.meta.slotId}), using file's slotId`,
        );
      }

      logWrite(
        "srv",
        "info",
        `SaveManager: loaded slot "${slotId}" (tick ${data.meta.gameTick}, round ${data.meta.round})`,
      );
      return new SaveManager(data);
    } catch (err) {
      logWrite(
        "srv",
        "warn",
        `SaveManager: failed to load slot "${slotId}": ${String(err)}, creating new save`,
      );
      return SaveManager.create(slotId, worldId, 0, 0);
    }
  }

  static create(slotId: string, worldId: string, tick: number, round: number): SaveManager {
    const data: SaveData = {
      meta: {
        slotId,
        worldId,
        savedAt: Math.floor(Date.now() / 1000),
        gameTick: tick,
        round,
      },
      conversations: {
        summaries: {},
      },
    };
    return new SaveManager(data);
  }

  static listSlots(): string[] {
    if (!existsSync(SAVES_DIR)) return [];
    return readdirSync(SAVES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
  }

  save(): void {
    if (!existsSync(SAVES_DIR)) {
      mkdirSync(SAVES_DIR, { recursive: true });
    }

    this.#data.meta.savedAt = Math.floor(Date.now() / 1000);

    const filePath = join(SAVES_DIR, `${this.#slotId}.json`);
    const tmpPath = join(SAVES_DIR, `.${this.#slotId}.tmp`);

    const json = JSON.stringify(this.#data, null, 2);

    writeFileSync(tmpPath, json, "utf-8");
    renameSync(tmpPath, filePath);
  }

  getMeta(): SaveMeta {
    return { ...this.#data.meta };
  }

  updateMeta(tick: number, round: number): void {
    this.#data.meta.gameTick = tick;
    this.#data.meta.round = round;
  }

  getConversationSummary(playerId: string, npcId: string): string | null {
    const key = `${playerId}:${npcId}`;
    const entries = this.#data.conversations.summaries[key];
    if (!entries || entries.length === 0) return null;
    return entries[entries.length - 1].summary;
  }

  setConversationSummary(playerId: string, npcId: string, summary: string, tick: number): void {
    const key = `${playerId}:${npcId}`;
    const entries = this.#data.conversations.summaries[key] ?? [];
    entries.push({ summary, lastTick: tick });
    this.#data.conversations.summaries[key] = entries;
  }
}
