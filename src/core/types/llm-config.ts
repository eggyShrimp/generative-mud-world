export interface LLMTriggerConfig {
  worldEvent: {
    perSettlement: number;
    enabled: boolean;
  };
  memoryCompression: {
    maxCandidates: number;
    minMemoriesToTrigger: number;
    enabled: boolean;
  };
  settlementGrowth: {
    npcToRoomRatio: number;
    prosperityThreshold: number;
    threatThreshold: number;
    enabled: boolean;
  };
  contentPoolEvolve: {
    checkDay: number;
    enabled: boolean;
  };
  narrativeDirection: {
    intervalMonths: number;
    enabled: boolean;
  };
  culturalEvolution: {
    adoptionThreshold: number;
    enabled: boolean;
  };
  discoveryGeneration: {
    activityThreshold: number;
    enabled: boolean;
  };
  dialogueOptions: {
    optionCount: number;
    enabled: boolean;
  };
}

export interface StorylineConfig {
  eventLookbackWindow: number;
}

export interface DialogueEffectMapping {
  relation: Record<string, { delta: number }>;
  needImpact: Record<string, { delta: number }>;
  information: Record<string, { memoryImportance: number; spreadChance: number }>;
  itemExchange: Record<string, { valueRange: [number, number] }>;
}

export interface SocialRippleConfig {
  enabled: boolean;
  signalStrength: Record<string, number>;
  relationWeightPoints: number[];
  relationWeightMultipliers: number[];
  traitMultipliers: Record<string, number>;
  threshold: number;
  maxDelta: number;
}
