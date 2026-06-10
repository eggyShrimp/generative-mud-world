const REVERSE_MAP: Record<string, string> = {
  北: "南",
  南: "北",
  东: "西",
  西: "东",
  上: "下",
  下: "上",
};

export function getReverseDirection(dir: string): string | null {
  return REVERSE_MAP[dir] ?? null;
}
