import { LLMAdapter } from "../llm/adapter.ts";
import { generateWorld } from "../llm/world-generator.ts";
import { getLLMConfig } from "../shared/config.ts";

const VALID_SCALES = ["village", "town", "city", "kingdom", "continent"] as const;
type Scale = (typeof VALID_SCALES)[number];

const rawScale = String(process.argv[2] ?? "town");
const scale: Scale = VALID_SCALES.includes(rawScale as Scale) ? (rawScale as Scale) : "town";
const seed = process.argv[3] ?? "一个铁器时代中期的世界";

const adapter = new LLMAdapter(getLLMConfig("worldGeneration"));

console.log(`Generating ${scale} world: "${seed}"...`);
const path = await generateWorld(adapter, { seed, scale });
console.log(`Done. Set WORLDS_FILE=${path} or update src/index.ts to load "${path}"`);
