import type { StatusMessage } from "../../../shared/protocol.ts";

export function buildRoomTitle(status: StatusMessage | null): string {
  const date = status?.date;
  const environment = [status?.season, status?.period, status?.weatherLabel]
    .filter(Boolean)
    .join(" · ");
  const suffix = [date, environment].filter(Boolean).join(" · ");
  return suffix ? `当前地点 · ${suffix}` : "当前地点";
}
