import { shouldRunPendingDialogueRequest } from "./dialogue-state.ts";
import type { Signals } from "./signals.ts";
import type { Transport } from "./transport.ts";
import type { ActiveRequest } from "./types.ts";

export interface RequestPipeline {
  sendRequest: (msg: Record<string, unknown>, build: (req: ActiveRequest) => void) => boolean;
  completeActiveRequest: () => void;
}

export function createRequestPipeline(
  sig: Signals,
  transport: Transport,
  getRequestTradeOptions: () => ((npcId: string) => void) | undefined,
): RequestPipeline {
  const sendRequest = (
    msg: Record<string, unknown>,
    build: (req: ActiveRequest) => void,
  ): boolean => {
    if (sig.hasActiveRequest()) {
      transport.pushBlockedEvent();
      return false;
    }
    if (!transport.send(msg)) return false;
    const req: ActiveRequest = {};
    build(req);
    sig.setActiveRequest(req);
    return true;
  };

  const completeActiveRequest = (): void => {
    sig.setActiveRequest(null);
    const pending = sig.pendingDialogueRequest();
    if (!pending) return;
    sig.setPendingDialogueRequest(null);
    queueMicrotask(() => {
      const current = sig.dialogue();
      if (!shouldRunPendingDialogueRequest(current, pending)) return;
      const reqTradeOptions = getRequestTradeOptions();
      if (pending.targetTab === "trade" && reqTradeOptions) reqTradeOptions(pending.npcId);
    });
  };

  return { sendRequest, completeActiveRequest };
}
