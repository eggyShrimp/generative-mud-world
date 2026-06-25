export type DayPeriod = string;
export type Season = string;
export type WeatherId = string;

export interface DayNightPeriodDef {
  id: DayPeriod;
  startHour: number;
  label: string;
  visibilityModifier: number;
}

export interface DayNightConfig {
  periods: DayNightPeriodDef[];
}

export interface SeasonDef {
  id: Season;
  name: string;
  months: number[];
  label: string;
  comfortTemp: number;
  needDecayMultiplier: number;
  narrativePrefix: string;
}

export interface SeasonConfig {
  seasons: SeasonDef[];
}

export interface WeatherType {
  id: string;
  label: string;
  movementMultiplier: number;
  visibilityMultiplier: number;
  narrativeDesc: string;
  availableInSeasons: Season[];
  weight: number;
}

export interface WeatherConfig {
  weatherTypes: WeatherType[];
}

export interface WeatherState {
  id: string;
  label: string;
  movementMultiplier: number;
  visibilityMultiplier: number;
  narrativeDesc: string;
}

export interface WarmthComfortConfig {
  baselineTemp: number;
  maxIdealWarmth: number;
  minIdealWarmth: number;
  penaltyPerWarmthPoint: number;
}
