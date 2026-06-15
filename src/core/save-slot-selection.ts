import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { SaveManager } from "./save-manager.ts";

export type SaveSelectMode = "skip" | "prompt";

export interface ResolveSaveSlotOptions {
  mode: string;
  configuredSlot: string;
  rootDir: string;
  prompt?: (question: string) => Promise<string>;
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

export async function resolveSaveSlot(options: ResolveSaveSlotOptions): Promise<string> {
  if (options.mode === "skip" || options.mode === "") {
    return options.configuredSlot;
  }
  if (options.mode !== "prompt") {
    throw new Error(`Unsupported SAVE_SELECT mode: ${options.mode}`);
  }

  const slots = SaveManager.listSlots(options.rootDir);
  const lines = slots.map((slot, index) => `${index + 1}. ${slot}`);
  const question =
    lines.length > 0
      ? `选择存档编号，输入新名称，或直接回车使用 ${options.configuredSlot}:\n${lines.join("\n")}\n> `
      : `没有现有存档。输入新名称，或直接回车使用 ${options.configuredSlot}:\n> `;
  const answer = (await (options.prompt ?? promptLine)(question)).trim();
  if (!answer) return options.configuredSlot;

  const index = Number(answer);
  if (Number.isInteger(index) && index >= 1 && index <= slots.length) {
    return slots[index - 1];
  }
  return answer;
}
