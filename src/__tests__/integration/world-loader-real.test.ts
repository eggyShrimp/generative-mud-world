/**
 * 集成测试: 真实 YAML 加载 round-trip
 *
 * 验证从磁盘 YAML 文件加载完整世界的一致性:
 *   1. loadWorldFromYaml 加载真实 YAML → 验证 rooms/exits/NPCs/ContentPool
 *   2. buildWorld(config) 用相同 config 重新构建 → 对比一致性
 *   3. ContentPool 从 YAML 加载后字段完整
 *   4. 临时目录写入 + 重新加载 round-trip
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadContentPoolFromDir } from "../../core/content-pool-loader.ts";
import type { NPCEntity, PlayerEntity } from "../../core/types.ts";
import { buildWorld, loadWorldFromYaml } from "../../core/world-loader.ts";

const TEST_DIR = join(import.meta.dirname, "../../.test-integration-yaml");

function cleanTestDir() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

beforeEach(cleanTestDir);
afterEach(cleanTestDir);

function createTestWorldYaml(dir: string): string {
  // 注意: WorldConfigSchema 不含 memories 字段, zod 会 strip 未知字段
  const yamlContent = `
name: test-world
seed: test-seed
era: 铁器
regions:
  - id: region_01
    name: 东村
    dominantCulture: 农耕
    prosperity: 60
    threatLevel: 20
rooms:
  - id: village
    name: 小村庄
    regionId: region_01
    description: 安静的小村庄
  - id: farm
    name: 麦田
    regionId: region_01
    description: 金黄的麦田
npcs:
  - id: npc_01
    name: 赵铁匠
    roomId: village
    personality: 勤劳朴实
    npcTier: core
    role: blacksmith
    traits:
      - name: diligent
        value: 80
    needs:
      hunger: 50
      rest: 60
      wealth: 40
players:
  - id: p1
    name: 探索者
    roomId: village
    description: 路过的旅人
    traits:
      - name: courage
        value: 60
`;

  const worldFile = join(dir, "test.yaml");
  writeFileSync(worldFile, yamlContent);
  return worldFile;
}

describe("集成: 真实 YAML 加载", () => {
  it("loadWorldFromYaml: 基本结构完整", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const worldFile = createTestWorldYaml(TEST_DIR);
    mkdirSync(join(TEST_DIR, "content-pool"), { recursive: true });

    const world = loadWorldFromYaml(worldFile);

    expect(world.regions.has("region_01")).toBe(true);
    expect(world.rooms.size).toBeGreaterThanOrEqual(2);
    expect(world.rooms.has("village")).toBe(true);
    expect(world.rooms.has("farm")).toBe(true);
    expect(world.entities.size).toBeGreaterThanOrEqual(2);
  });

  it("loadWorldFromYaml: NPC 正确加载 (角色/特质/需求)", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const worldFile = createTestWorldYaml(TEST_DIR);
    mkdirSync(join(TEST_DIR, "content-pool"), { recursive: true });

    const world = loadWorldFromYaml(worldFile);
    const npc = world.entities.get("npc_01") as NPCEntity;

    expect(npc).toBeDefined();
    expect(npc.name).toBe("赵铁匠");
    expect(npc.roomId).toBe("village");
    expect(npc.personality).toBe("勤劳朴实");
    expect(npc.npcTier).toBe("core");

    // 特质
    expect(npc.traits).toHaveLength(1);
    expect(npc.traits[0].name).toBe("diligent");
    expect(npc.traits[0].value).toBe(80);

    // 需求 (从 needs config + needDefinitions 映射)
    expect(npc.needs.length).toBeGreaterThan(0);
    const hunger = npc.needs.find((n) => n.type === "hunger");
    expect(hunger?.value).toBe(50);

    // schedule (从 role=blacksmith 查 ContentPool scheduleTemplates)
    expect(npc.schedule.length).toBeGreaterThan(0);
  });

  it("loadWorldFromYaml: Player 正确加载", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const worldFile = createTestWorldYaml(TEST_DIR);
    mkdirSync(join(TEST_DIR, "content-pool"), { recursive: true });

    const world = loadWorldFromYaml(worldFile);
    const player = world.entities.get("p1");

    expect(player).toBeDefined();
    expect(player?.name).toBe("探索者");
    expect(player?.roomId).toBe("village");
    expect(player?.type).toBe("player");
  });

  it("loadWorldFromYaml: 无 content-pool 目录时 fallback 到 defaults", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const worldFile = createTestWorldYaml(TEST_DIR);
    // 不创建 content-pool 目录

    const world = loadWorldFromYaml(worldFile);

    expect(world.contentPool.needDefinitions.length).toBeGreaterThan(0);
    expect(world.contentPool.actionEffects.length).toBeGreaterThan(0);
    expect(world.contentPool.scheduleTemplates.length).toBeGreaterThan(0);
  });

  it("loadWorldFromYaml: generated_continent 起始玩家带有测试书籍", () => {
    const world = loadWorldFromYaml(
      join(import.meta.dirname, "../../../worlds/generated_continent.yaml"),
    );
    const player = world.entities.get("player_01") as PlayerEntity;
    const readableBooks = player.inventory.filter((item) => item.properties.readable === true);

    expect(readableBooks.map((item) => item.templateId).sort()).toEqual([
      "caravan_route_notes",
      "herb_manual",
      "sutra_copy",
    ]);
  });

  it("buildWorld: 与 loadWorldFromYaml 产出结构一致", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const worldFile = createTestWorldYaml(TEST_DIR);
    mkdirSync(join(TEST_DIR, "content-pool"), { recursive: true });

    const yamlWorld = loadWorldFromYaml(worldFile);

    const config = {
      name: "test-world",
      seed: "test-seed",
      era: "铁器",
      regions: [
        {
          id: "region_01" as const,
          name: "东村",
          dominantCulture: "农耕",
          prosperity: 60,
          threatLevel: 20,
        },
      ],
      rooms: [
        {
          id: "village" as const,
          name: "小村庄",
          regionId: "region_01" as const,
          description: "安静的小村庄",
        },
        {
          id: "farm" as const,
          name: "麦田",
          regionId: "region_01" as const,
          description: "金黄的麦田",
        },
      ],
      npcs: [
        {
          id: "npc_01",
          name: "赵铁匠",
          roomId: "village" as const,
          personality: "勤劳朴实",
          npcTier: "core" as const,
          role: "blacksmith",
          traits: [{ name: "diligent", value: 80 }],
          needs: { hunger: 50, rest: 60, wealth: 40 },
        },
      ],
      players: [
        {
          id: "p1",
          name: "探索者",
          roomId: "village" as const,
          description: "路过的旅人",
          traits: [{ name: "courage", value: 60 }],
        },
      ],
    };
    const builtWorld = buildWorld(config, yamlWorld.contentPool);

    expect(builtWorld.regions.size).toBe(yamlWorld.regions.size);
    expect(builtWorld.rooms.size).toBe(yamlWorld.rooms.size);
    expect(builtWorld.entities.size).toBe(yamlWorld.entities.size);

    const yamlNpc = yamlWorld.entities.get("npc_01") as NPCEntity;
    const builtNpc = builtWorld.entities.get("npc_01") as NPCEntity;
    expect(builtNpc.name).toBe(yamlNpc.name);
    expect(builtNpc.roomId).toBe(yamlNpc.roomId);
    expect(builtNpc.personality).toBe(yamlNpc.personality);
    expect(builtNpc.traits).toEqual(yamlNpc.traits);
  });

  it("ContentPool YAML 加载: 使用 domain 文件名", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    // 文件名必须是 domain 名 (needs-actions, schedules, social-dialogue 等)
    const yamlContent = `
needDefinitions:
  - type: morale
    baseUrgency: 0.3
    decayRate: 2
    description: 士气
    bornFrom: baseline
actionEffects:
  - action: rally
    needDeltas:
      morale: 10
      rest: -5
`;
    writeFileSync(join(poolDir, "needs-actions.yaml"), yamlContent);

    const pool = loadContentPoolFromDir(poolDir);

    const morale = pool.needDefinitions.find((n) => n.type === "morale");
    expect(morale).toBeDefined();
    expect(morale?.baseUrgency).toBe(0.3);

    const rally = pool.actionEffects.find((a) => a.action === "rally");
    expect(rally).toBeDefined();
    expect(rally?.needDeltas.morale).toBe(10);

    // 重新加载 → 结果一致
    const pool2 = loadContentPoolFromDir(poolDir);
    expect(pool2.needDefinitions.find((n) => n.type === "morale")?.baseUrgency).toBe(0.3);
    expect(pool2.actionEffects.find((a) => a.action === "rally")?.needDeltas.morale).toBe(10);
  });
});
