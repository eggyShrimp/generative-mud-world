import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { LLMAdapter } from "./adapter.ts";

interface WorldGenConfig {
  seed: string;
  scale: "village" | "town" | "city" | "kingdom" | "continent";
  outputPath?: string;
}

const SCALE_PRESETS = {
  village: { regions: 1, roomsPerRegion: 4, npcsPerRoom: 1, factions: 0 },
  town: { regions: 1, roomsPerRegion: 8, npcsPerRoom: 2, factions: 2 },
  city: { regions: 2, roomsPerRegion: 6, npcsPerRoom: 3, factions: 3 },
  kingdom: { regions: 4, roomsPerRegion: 8, npcsPerRoom: 2, factions: 5 },
  continent: { regions: 8, roomsPerRegion: 10, npcsPerRoom: 2, factions: 8 },
};

export async function generateWorld(adapter: LLMAdapter, config: WorldGenConfig): Promise<string> {
  const preset = SCALE_PRESETS[config.scale];

  const prompt = {
    system: `你是世界生成引擎。生成完整的 YAML 世界配置文件。

规则:
- 输出纯 YAML，不要 markdown 代码块包裹
- 创建 ${preset.regions} 个区域
- 每个区域 ${preset.roomsPerRegion} 个房间
- 每个房间 ${preset.npcsPerRoom} 个 NPC
- ${preset.factions > 0 ? `创建 ${preset.factions} 个派系` : "不需要派系"}
- 所有文本使用中文
- NPC 人格描述要具体生动，不要套话
- 命名符合种子世界的文化风格

YAML 格式:
\`\`\`
name: 世界名称
seed: "${config.seed}"
era: 时代背景

regions:
  - id: region_01
    name: 区域名
    dominantCulture: 主导文化
    prosperity: (0-100)
    threatLevel: (0-100)

rooms:
  - id: room_01
    name: 地点名
    regionId: region_01
    description: 环境描述

exits:  # 房间间连接
  room_01:
    北: room_02
  room_02:
    南: room_01

npcs:
  - id: npc_01
    name: 角色名
    roomId: room_01
    personality: 人格描述
    npcTier: core
    role: blacksmith
    needs:
      hunger: 70
      safety: 60
      social: 50
      rest: 80
      wealth: 50

players:
  - id: player_01
    name: 起始角色名
    roomId: room_01
    description: 角色背景故事
\`\`\`

角色分配规则:
- core NPC: 每个区域3-5个关键角色（商人、守卫、贵族、首领）
- regional NPC: 每房间1-2个角色（店主、工匠、农民）
- role 可选: blacksmith, guard, farmer, tavern_keeper, merchant, noble, priest, scholar, hunter, bandit`,

    user: `种子: ${config.seed}
规模: ${config.scale} (${preset.regions}区 × ${preset.roomsPerRegion}房 × ${preset.npcsPerRoom}NPC)
请生成完整的世界配置。`,
  };

  const response = await adapter.chat(
    prompt.system,
    prompt.user,
    undefined,
    undefined,
    "world-generation",
  );
  let yaml = response.text.trim();

  // Clean up markdown wrapper
  yaml = yaml.replace(/^```ya?ml\n?/, "").replace(/\n?```$/, "");

  // Auto-fill NPCs if LLM missed them
  if (!yaml.includes("npc_")) {
    const roomLines = yaml.match(/^ {2}- id: (room_\w+)/gm) ?? [];
    const npcSection = ["\nnpcs:"];
    const roomIds = roomLines.map((l) => l.replace("  - id: ", ""));
    for (const roomId of roomIds) {
      const index = roomIds.indexOf(roomId);
      npcSection.push(`  - id: npc_${roomId}_01`);
      npcSection.push(`    name: 无名旅人${index + 1}`);
      npcSection.push(`    roomId: ${roomId}`);
      npcSection.push("    personality: 沉默寡言");
      npcSection.push("    npcTier: background");
      npcSection.push("    role: farmer");
      npcSection.push("    needs:");
      npcSection.push("      hunger: 60");
      npcSection.push("      safety: 50");
      npcSection.push("      rest: 70");
    }
    yaml = `${yaml.trimEnd()}\n${npcSection.join("\n")}`;
  }

  const _cleanYaml = yaml;

  const outputPath = config.outputPath ?? `worlds/generated_${config.scale}.yaml`;
  const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outputPath, yaml, "utf-8");

  console.log(`World generated: ${outputPath} (${yaml.length} chars)`);
  return outputPath;
}
