import { describe, expect, it } from "vitest";
import type { DayNightConfig, Region, RegionId, SeasonConfig, WeatherConfig } from "../core/types";
import {
  addRegion,
  advanceDay,
  advanceTime,
  computeDayPeriod,
  computeSeason,
  computeWeatherByRegion,
  createWorld,
  selectWeather,
} from "../core/world";

describe("computeDayPeriod", () => {
  const config: DayNightConfig = {
    periods: [
      { id: "dawn", startHour: 5, label: "清晨", visibilityModifier: 0.7 },
      { id: "morning", startHour: 7, label: "上午", visibilityModifier: 1.0 },
      { id: "afternoon", startHour: 12, label: "午后", visibilityModifier: 1.0 },
      { id: "dusk", startHour: 18, label: "黄昏", visibilityModifier: 0.8 },
      { id: "night", startHour: 21, label: "深夜", visibilityModifier: 0.5 },
    ],
  };

  it("hour 4 (before first period) → night (wraps to last period)", () => {
    expect(computeDayPeriod(4, config)).toBe("night");
  });

  it("hour 5 → dawn", () => {
    expect(computeDayPeriod(5, config)).toBe("dawn");
  });

  it("hour 7 → morning", () => {
    expect(computeDayPeriod(7, config)).toBe("morning");
  });

  it("hour 12 → afternoon", () => {
    expect(computeDayPeriod(12, config)).toBe("afternoon");
  });

  it("hour 18 → dusk", () => {
    expect(computeDayPeriod(18, config)).toBe("dusk");
  });

  it("hour 21 → night", () => {
    expect(computeDayPeriod(21, config)).toBe("night");
  });

  it("hour 23 (after last period start) → night", () => {
    expect(computeDayPeriod(23, config)).toBe("night");
  });

  it("hour 6 (between dawn and morning) → dawn", () => {
    expect(computeDayPeriod(6, config)).toBe("dawn");
  });
});

describe("computeSeason", () => {
  const config: SeasonConfig = {
    seasons: [
      {
        id: "spring",
        name: "春",
        months: [1, 2, 3],
        label: "春",
        comfortTemp: 18,
        needDecayMultiplier: 1.0,
        narrativePrefix: "春风拂面",
      },
      {
        id: "summer",
        name: "夏",
        months: [4, 5, 6],
        label: "夏",
        comfortTemp: 32,
        needDecayMultiplier: 1.0,
        narrativePrefix: "烈日当空",
      },
      {
        id: "autumn",
        name: "秋",
        months: [7, 8, 9],
        label: "秋",
        comfortTemp: 15,
        needDecayMultiplier: 1.1,
        narrativePrefix: "秋风萧瑟",
      },
      {
        id: "winter",
        name: "冬",
        months: [10, 11, 12],
        label: "冬",
        comfortTemp: -8,
        needDecayMultiplier: 1.5,
        narrativePrefix: "寒风刺骨",
      },
    ],
  };

  it("month 1 → spring", () => {
    expect(computeSeason(1, config)).toBe("spring");
  });

  it("month 4 → summer", () => {
    expect(computeSeason(4, config)).toBe("summer");
  });

  it("month 7 → autumn", () => {
    expect(computeSeason(7, config)).toBe("autumn");
  });

  it("month 10 → winter", () => {
    expect(computeSeason(10, config)).toBe("winter");
  });

  it("month 12 → winter", () => {
    expect(computeSeason(12, config)).toBe("winter");
  });

  it("month 2 → spring (mid-season)", () => {
    expect(computeSeason(2, config)).toBe("spring");
  });

  it("month 6 → summer (end of summer)", () => {
    expect(computeSeason(6, config)).toBe("summer");
  });
});

describe("selectWeather", () => {
  const config: WeatherConfig = {
    weatherTypes: [
      {
        id: "clear",
        label: "晴朗",
        movementMultiplier: 1.0,
        visibilityMultiplier: 1.0,
        narrativeDesc: "阳光明媚",
        availableInSeasons: ["spring", "summer", "autumn", "winter"],
        weight: 50,
      },
      {
        id: "overcast",
        label: "阴天",
        movementMultiplier: 1.0,
        visibilityMultiplier: 0.9,
        narrativeDesc: "天空阴沉",
        availableInSeasons: ["spring", "summer", "autumn", "winter"],
        weight: 25,
      },
      {
        id: "light_rain",
        label: "细雨",
        movementMultiplier: 0.8,
        visibilityMultiplier: 0.7,
        narrativeDesc: "细雨蒙蒙",
        availableInSeasons: ["spring", "summer", "autumn"],
        weight: 15,
      },
      {
        id: "heavy_rain",
        label: "暴雨",
        movementMultiplier: 0.6,
        visibilityMultiplier: 0.5,
        narrativeDesc: "暴雨倾盆",
        availableInSeasons: ["summer", "autumn"],
        weight: 5,
      },
      {
        id: "fog",
        label: "大雾",
        movementMultiplier: 0.9,
        visibilityMultiplier: 0.4,
        narrativeDesc: "雾气弥漫",
        availableInSeasons: ["spring", "autumn"],
        weight: 10,
      },
      {
        id: "light_snow",
        label: "小雪",
        movementMultiplier: 0.7,
        visibilityMultiplier: 0.7,
        narrativeDesc: "雪花纷飞",
        availableInSeasons: ["winter"],
        weight: 15,
      },
      {
        id: "blizzard",
        label: "暴风雪",
        movementMultiplier: 0.4,
        visibilityMultiplier: 0.3,
        narrativeDesc: "风雪交加",
        availableInSeasons: ["winter"],
        weight: 5,
      },
    ],
  };

  it("winter excludes spring/summer-only weather types", () => {
    const winterOnlyIds = ["clear", "overcast", "light_snow", "blizzard"];
    for (let i = 0; i < 20; i++) {
      const randomSequence = Array.from({ length: 10 }, (_, idx) => (idx * 0.07 + i * 0.01) % 1);
      let callIdx = 0;
      const mockRandom = () => randomSequence[callIdx++ % randomSequence.length];
      const weather = selectWeather("winter", config, mockRandom);
      expect(winterOnlyIds).toContain(weather.id);
    }
  });

  it("selects first weather when random returns near-zero", () => {
    // Winter candidates: clear(50), overcast(25), light_snow(15), blizzard(5) — total=95
    // random()=0.0 → roll=0 → first candidate: clear
    const mockRandom = () => 0.0;
    const weather = selectWeather("winter", config, mockRandom);
    expect(weather.id).toBe("clear");
  });

  it("selects later weather when random returns high value", () => {
    // Winter candidates total weight = 95
    // random()=0.99 → roll=94.05, subtract clear(50)=44.05, overcast(25)=19.05, light_snow(15)=4.05, blizzard(5)→roll<=0
    const mockRandom = () => 0.99;
    const weather = selectWeather("winter", config, mockRandom);
    expect(weather.id).toBe("blizzard");
  });

  it("selects overcast when random lands in its range", () => {
    // Winter: clear(50/95≈0.526), overcast(25/95≈0.263)
    // random()=0.55 → roll=52.25, subtract clear(50)=2.25, overcast(25)→roll<=0
    const mockRandom = () => 0.55;
    const weather = selectWeather("winter", config, mockRandom);
    expect(weather.id).toBe("overcast");
  });

  it("returns WeatherState with correct fields", () => {
    const mockRandom = () => 0.0;
    const weather = selectWeather("spring", config, mockRandom);
    expect(weather).toHaveProperty("id");
    expect(weather).toHaveProperty("label");
    expect(weather).toHaveProperty("movementMultiplier");
    expect(weather).toHaveProperty("visibilityMultiplier");
    expect(weather).toHaveProperty("narrativeDesc");
  });

  it("spring excludes winter-only weather types", () => {
    const springCandidates = ["clear", "overcast", "light_rain", "heavy_rain", "fog"];
    for (let i = 0; i < 20; i++) {
      const randomSequence = Array.from({ length: 10 }, (_, idx) => (idx * 0.07 + i * 0.01) % 1);
      let callIdx = 0;
      const mockRandom = () => randomSequence[callIdx++ % randomSequence.length];
      const weather = selectWeather("spring", config, mockRandom);
      expect(springCandidates).toContain(weather.id);
    }
  });
});

describe("computeWeatherByRegion", () => {
  const weatherConfig: WeatherConfig = {
    weatherTypes: [
      {
        id: "clear",
        label: "晴朗",
        movementMultiplier: 1.0,
        visibilityMultiplier: 1.0,
        narrativeDesc: "阳光明媚",
        availableInSeasons: ["spring", "summer", "autumn", "winter"],
        weight: 50,
      },
      {
        id: "overcast",
        label: "阴天",
        movementMultiplier: 1.0,
        visibilityMultiplier: 0.9,
        narrativeDesc: "天空阴沉",
        availableInSeasons: ["spring", "summer", "autumn", "winter"],
        weight: 25,
      },
    ],
  };

  it("returns one entry per region", () => {
    const regions = new Map<RegionId, unknown>([
      ["forest", {}],
      ["desert", {}],
    ]);
    const mockRandom = () => 0.5;
    const result = computeWeatherByRegion(regions, "spring", weatherConfig, mockRandom);
    expect(result.size).toBe(2);
    expect(result.has("forest")).toBe(true);
    expect(result.has("desert")).toBe(true);
  });

  it("all regions get the same weather (current implementation)", () => {
    const regions = new Map<RegionId, unknown>([
      ["forest", {}],
      ["desert", {}],
      ["mountain", {}],
    ]);
    const mockRandom = () => 0.0;
    const result = computeWeatherByRegion(regions, "spring", weatherConfig, mockRandom);
    const values = Array.from(result.values());
    expect(values[0].id).toBe(values[1].id);
    expect(values[1].id).toBe(values[2].id);
  });

  it("returns empty map for no regions", () => {
    const regions = new Map<RegionId, unknown>();
    const result = computeWeatherByRegion(regions, "spring", weatherConfig, () => 0.5);
    expect(result.size).toBe(0);
  });
});

describe("advanceDay integration", () => {
  it("populates period, season, and weatherByRegion after advancing", () => {
    const world = createWorld();
    const forestRegion: Region = {
      id: "forest",
      name: "森林",
      dominantCulture: "农耕",
      prosperity: 50,
      threatLevel: 10,
    };
    const desertRegion: Region = {
      id: "desert",
      name: "荒漠",
      dominantCulture: "游牧",
      prosperity: 30,
      threatLevel: 20,
    };
    addRegion(world, forestRegion);
    addRegion(world, desertRegion);

    advanceDay(world);

    expect(world.time.period).toBeDefined();
    expect(["dawn", "morning", "afternoon", "dusk", "night"]).toContain(world.time.period);
    expect(world.time.season).toBeDefined();
    expect(["spring", "summer", "autumn", "winter"]).toContain(world.time.season);
    expect(world.weatherByRegion.size).toBe(2);
    expect(world.weatherByRegion.has("forest")).toBe(true);
    expect(world.weatherByRegion.has("desert")).toBe(true);
    for (const weather of world.weatherByRegion.values()) {
      expect(weather).toHaveProperty("id");
      expect(weather).toHaveProperty("label");
      expect(weather).toHaveProperty("movementMultiplier");
    }
  });

  it("day increments and time advances correctly", () => {
    const world = createWorld();
    const initialDay = world.time.day;
    const initialTick = world.tick;

    advanceDay(world);

    expect(world.time.day).toBe(initialDay + 1);
    expect(world.tick).toBe(initialTick + 24 * 60);
    expect(world.time.minute).toBe(0);
    expect(world.time.hour).toBe(world.contentPool.calendar.hourStart);
  });

  it("month rolls over when day exceeds daysPerMonth", () => {
    const world = createWorld();
    world.time.day = 30;
    world.time.month = 1;

    advanceDay(world);

    expect(world.time.day).toBe(1);
    expect(world.time.month).toBe(2);
  });
});

describe("advanceTime period sync", () => {
  it("refreshes period without rerolling weather", () => {
    const world = createWorld();
    const forestRegion: Region = {
      id: "forest",
      name: "森林",
      dominantCulture: "农耕",
      prosperity: 50,
      threatLevel: 10,
    };
    addRegion(world, forestRegion);

    // Set up initial state via advanceDay
    advanceDay(world);
    const weatherBefore = new Map(world.weatherByRegion);

    // Move to a different hour that changes period
    world.time.hour = 20; // dusk range: 18-20
    advanceTime(world, 60); // hour becomes 21 → night

    expect(world.time.period).toBe("night");
    // Weather should NOT have been rerolled (advanceTime doesn't touch weather)
    for (const [regionId, weather] of world.weatherByRegion) {
      const before = weatherBefore.get(regionId);
      expect(before).toBeDefined();
      expect(weather.id).toBe(before!.id);
      expect(weather.label).toBe(before!.label);
    }
  });

  it("period changes from morning to afternoon across hour boundary", () => {
    const world = createWorld();
    world.time.hour = 11;
    world.time.minute = 45;

    advanceTime(world, 15); // hour becomes 12

    expect(world.time.hour).toBe(12);
    expect(world.time.minute).toBe(0);
    expect(world.time.period).toBe("afternoon");
  });

  it("hour wraps from 23 to 0 and day increments", () => {
    const world = createWorld();
    world.time.hour = 23;
    world.time.minute = 50;
    world.time.day = 5;

    advanceTime(world, 15);

    expect(world.time.hour).toBe(0);
    expect(world.time.minute).toBe(5);
    expect(world.time.day).toBe(6);
  });
});
