import { WebSocket } from "ws";
import type { EntityId } from "../../core/types.ts";

export interface Session {
  id: string;
  ws: WebSocket;
  playerId?: EntityId;
  controlledEntityId?: EntityId;
  lastPushedTick: number;
}

export function getConnectedPlayerIds(sessions: Map<string, Session>): EntityId[] {
  const ids: EntityId[] = [];
  pruneClosedSessions(sessions);
  for (const session of sessions.values()) {
    if (session.playerId) ids.push(session.playerId);
  }
  return ids;
}

export function pruneClosedSessions(sessions: Map<string, Session>): void {
  for (const [id, session] of sessions.entries()) {
    if (session.ws.readyState === WebSocket.CLOSED || session.ws.readyState === WebSocket.CLOSING) {
      sessions.delete(id);
    }
  }
}
