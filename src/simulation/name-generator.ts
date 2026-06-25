import type { NamePool } from "../core/types.ts";

export function generateName(
  pool: NamePool,
  gender: "male" | "female" | "neutral" = "neutral",
): string {
  const surname = pick(pool.surnames);
  if (!surname) throw new Error(`NamePool ${pool.culture} has no surnames`);
  let given: string | undefined;

  switch (gender) {
    case "male":
      given = pick(pool.maleGiven.length > 0 ? pool.maleGiven : pool.neutralGiven);
      break;
    case "female":
      given = pick(pool.femaleGiven.length > 0 ? pool.femaleGiven : pool.neutralGiven);
      break;
    default:
      given = pick(pool.neutralGiven);
  }
  if (!given) throw new Error(`NamePool ${pool.culture} has no ${gender} given names`);

  return `${surname}${given}`;
}

export function generateEpithet(pool: NamePool, role: string, givenName?: string): string {
  if (givenName) {
    // 如 "老铁"、"小张"
    const pattern = pick(pool.epithetPatterns) ?? "{role}";
    return pattern
      .replace("{surname}", givenName.charAt(0))
      .replace("{given}", givenName)
      .replace("{char}", givenName.slice(-1))
      .replace("{role}", role)
      .replace("{name}", givenName);
  }
  return `${role}`;
}

export function findNamePool(pools: NamePool[], culture: string): NamePool {
  return pools.find((p) => p.culture === culture) ?? pools[0];
}

function pick<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}
