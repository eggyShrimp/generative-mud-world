import type {
  ContentPool,
  DayNightConfig,
  DayPeriod,
  GameTime,
  RegionId,
  Season,
  SeasonConfig,
  WeatherConfig,
  WeatherState,
  WorldState,
} from "../types.ts";

export function advanceTime(world: WorldState, durationMinutes: number): void {
  const minutes = Math.max(0, Math.floor(durationMinutes));
  if (minutes === 0) return;

  const cal = world.contentPool.calendar;
  world.tick += minutes;
  world.time.tick = world.tick;

  let totalMinutes = world.time.hour * 60 + world.time.minute + minutes;
  while (totalMinutes >= 24 * 60) {
    totalMinutes -= 24 * 60;
    world.time.day++;
    if (world.time.day > cal.daysPerMonth) {
      world.time.day = 1;
      world.time.month++;
      if (world.time.month > cal.monthsPerYear) {
        world.time.month = 1;
        world.time.year++;
      }
    }
  }

  world.time.hour = Math.floor(totalMinutes / 60);
  world.time.minute = totalMinutes % 60;
  // Refresh period/season without rerolling weather (weather stays until daily settlement)
  world.time.period = computeDayPeriod(world.time.hour, world.contentPool.dayNightConfig);
  world.time.season = computeSeason(world.time.month, world.contentPool.seasonConfig);
}

export function computeDayPeriod(hour: number, config: DayNightConfig): DayPeriod {
  const periods = config.periods;
  // Walk backwards to find the period whose startHour <= current hour
  let matched = periods[periods.length - 1];
  for (let i = periods.length - 1; i >= 0; i--) {
    if (periods[i].startHour <= hour) {
      matched = periods[i];
      break;
    }
  }
  return matched.id as DayPeriod;
}

export function computeSeason(month: number, config: SeasonConfig): Season {
  for (const season of config.seasons) {
    if (season.months.includes(month)) {
      return season.id as Season;
    }
  }
  // Default fallback: first season
  return config.seasons[0].id as Season;
}

export function selectWeather(
  season: Season,
  config: WeatherConfig,
  random: () => number = Math.random,
): WeatherState {
  const candidates = config.weatherTypes.filter((w) => w.availableInSeasons.includes(season));
  if (candidates.length === 0) {
    // Fallback: use first weather type
    const fallback = config.weatherTypes[0];
    return {
      id: fallback.id,
      label: fallback.label,
      movementMultiplier: fallback.movementMultiplier,
      visibilityMultiplier: fallback.visibilityMultiplier,
      narrativeDesc: fallback.narrativeDesc,
    };
  }
  const totalWeight = candidates.reduce((sum, w) => sum + w.weight, 0);
  let roll = random() * totalWeight;
  for (const w of candidates) {
    roll -= w.weight;
    if (roll <= 0) {
      return {
        id: w.id,
        label: w.label,
        movementMultiplier: w.movementMultiplier,
        visibilityMultiplier: w.visibilityMultiplier,
        narrativeDesc: w.narrativeDesc,
      };
    }
  }
  // Fallback: use last candidate
  const last = candidates[candidates.length - 1];
  return {
    id: last.id,
    label: last.label,
    movementMultiplier: last.movementMultiplier,
    visibilityMultiplier: last.visibilityMultiplier,
    narrativeDesc: last.narrativeDesc,
  };
}

export function computeWeatherByRegion(
  regions: Map<RegionId, unknown>,
  season: Season,
  config: WeatherConfig,
  random: () => number = Math.random,
): Map<RegionId, WeatherState> {
  const result = new Map<RegionId, WeatherState>();
  // First implementation: same weather for all regions
  const weather = selectWeather(season, config, random);
  for (const [regionId] of regions) {
    result.set(regionId, weather);
  }
  return result;
}

export function advanceDay(world: WorldState): void {
  const cal = world.contentPool.calendar;
  world.time.minute = 0;
  world.time.hour = cal.hourStart;
  world.time.day++;
  world.tick += 24 * 60;
  world.time.tick = world.tick;
  if (world.time.day > cal.daysPerMonth) {
    world.time.day = 1;
    world.time.month++;
    if (world.time.month > cal.monthsPerYear) {
      world.time.month = 1;
      world.time.year++;
    }
  }
  refreshDailyEnvironment(world);
}

export function refreshDailyEnvironment(world: WorldState): void {
  world.time.period = computeDayPeriod(world.time.hour, world.contentPool.dayNightConfig);
  world.time.season = computeSeason(world.time.month, world.contentPool.seasonConfig);
  world.weatherByRegion = computeWeatherByRegion(
    world.regions,
    world.time.season,
    world.contentPool.weatherConfig,
  );
}

export function formatDate(time: GameTime, pool?: { calendar: ContentPool["calendar"] }): string {
  const cal = pool?.calendar;
  const monthNames = cal?.monthNames ?? [];
  const month = monthNames[time.month - 1] ?? String(time.month);
  const yearStr = cal?.yearFormat
    ? cal.yearFormat.replace("{era}", cal.eraName).replace("{year}", String(time.year))
    : String(time.year);
  const day = cal?.dayFormat ? cal.dayFormat.replace("{day}", String(time.day)) : String(time.day);
  return `${yearStr} ${month} ${day}`;
}
