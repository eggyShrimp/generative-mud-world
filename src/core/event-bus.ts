import type { EntityId, RegionId, RoomId, WorldEvent } from "./types.ts";

export type EventListener = (event: WorldEvent) => void;

export class EventBus {
  private listeners = new Map<string, EventListener[]>();
  private aoiRegistry = new Map<EntityId, { roomId?: RoomId; regionId?: RegionId }>();

  subscribe(pattern: string, listener: EventListener): () => void {
    const listeners = this.listeners.get(pattern) ?? [];
    listeners.push(listener);
    this.listeners.set(pattern, listeners);
    return () => this.unsubscribe(pattern, listener);
  }

  private unsubscribe(pattern: string, listener: EventListener): void {
    const listeners = this.listeners.get(pattern);
    if (listeners) {
      this.listeners.set(
        pattern,
        listeners.filter((l) => l !== listener),
      );
    }
  }

  registerAOI(entityId: EntityId, roomId?: RoomId, regionId?: RegionId): void {
    this.aoiRegistry.set(entityId, { roomId, regionId });
  }

  unregisterAOI(entityId: EntityId): void {
    this.aoiRegistry.delete(entityId);
  }

  emit(event: WorldEvent): void {
    for (const [pattern, listeners] of this.listeners) {
      if (this.matches(event, pattern)) {
        for (const listener of listeners) {
          listener(event);
        }
      }
    }
  }

  // 推送事件给 AOI 匹配的实体 (用于玩家推送)
  getEventsForEntity(entityId: EntityId, events: WorldEvent[]): WorldEvent[] {
    const aoi = this.aoiRegistry.get(entityId);
    if (!aoi) return events.filter((e) => e.scope === "global");

    return events.filter((event) => {
      if (event.scope === "global") return true;
      if (aoi.roomId && event.scope === aoi.roomId) return true;
      if (aoi.regionId && event.scope === aoi.regionId) return true;
      return false;
    });
  }

  private matches(event: WorldEvent, pattern: string): boolean {
    if (pattern === "*") return true;
    if (pattern === event.type) return true;
    if (pattern === event.scope) return true;
    return false;
  }

  clear(): void {
    this.listeners.clear();
    this.aoiRegistry.clear();
  }
}
