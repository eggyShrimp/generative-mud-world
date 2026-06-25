import { logWrite } from "../../shared/log.ts";
import type { DialogueOption, TradeOption } from "../../shared/protocol.ts";
import {
  appendToHistory,
  applyDialogueOptionsToTab,
  applyFollowUpOptions,
  applyNpcReply,
  applyTradeOptionsToTab,
  buildFollowUpLoadingState,
  buildLoadingDialogueState,
  clearFollowUpContext,
  computeTabSwitch,
  createDialogueState,
  extractNpcReply,
  getDialogueOptionBehavior,
  hasVisibleQuestNegotiation,
  responseTabForOptionType,
  tradeOptionDetail,
} from "./dialogue-state.ts";
import type { RequestPipeline } from "./request-pipeline.ts";
import type { Signals } from "./signals.ts";
import type { Transport } from "./transport.ts";
import type { ActiveRequest, DialogueState, DialogueTab } from "./types.ts";

export interface DialogueOrchestrator {
  stashFollowUpSelection: (text: string) => void;
  popFollowUpSelection: () => string | null;
  showFollowUpSelectionRequired: () => void;
  sendDialogueCleanupIfNeeded: (current: DialogueState | null) => void;
  buildTalkHandlers: (req: ActiveRequest, expectOptions: boolean, responseTab: DialogueTab) => void;
  handleTradeSelection: (option: TradeOption) => void;
  clearTradeSelection: () => void;
  requestDialogueOptions: (npcId: string) => void;
  chooseDialogueOption: (option: DialogueOption) => void;
  chooseTradeOption: (option: TradeOption) => void;
  sendTradeAction: (npcId: string, action: "buy" | "sell", itemId: string) => void;
  switchDialogueTab: (direction: -1 | 1) => void;
  requestTradeOptions: (npcId: string) => void;
  requestSellOptions: (npcId: string) => void;
  requestFollowUpOptions: (context: string) => void;
}

export function createDialogueOrchestrator(
  sig: Signals,
  transport: Transport,
  rp: RequestPipeline,
): DialogueOrchestrator {
  let followUpSelectionStash: string | null = null;
  let pendingFollowUp: {
    npcId: string;
    context: string;
    previousChatOptions: DialogueOption[];
  } | null = null;

  const stashFollowUpSelection = (text: string) => {
    followUpSelectionStash = text;
  };

  const popFollowUpSelection = (): string | null => {
    const text = followUpSelectionStash;
    followUpSelectionStash = null;
    return text;
  };

  const showFollowUpSelectionRequired = () => {
    transport.pushEvents([{ type: "system", description: "请先选中一句 NPC 的话。" }]);
  };

  const sendDialogueCleanupIfNeeded = (current: DialogueState | null) => {
    if (!current || sig.hasActiveRequest() || !hasVisibleQuestNegotiation(current)) return;
    const options = current.tabs.chat.options;
    const closeOption =
      options.find(
        (o) => o.id === "chat:goodbye" && getDialogueOptionBehavior(o).kind === "close",
      ) ?? options.find((o) => getDialogueOptionBehavior(o).kind === "close");
    if (!closeOption) return;
    transport.send({
      type: "talk",
      npcId: current.npcId,
      optionId: closeOption.id,
      label: closeOption.label,
      optionType: closeOption.type,
    });
  };

  const buildTalkHandlers = (
    req: ActiveRequest,
    expectOptions: boolean,
    responseTab: DialogueTab,
  ): void => {
    req.onCommandResult = (msg) => {
      if (responseTab === "trade") return;
      const npcReplyText = extractNpcReply(msg.events);
      if (npcReplyText) {
        sig.setDialogue((prev) => {
          if (!prev) return prev;
          return applyNpcReply(prev, npcReplyText);
        });
      }
    };
    if (expectOptions) {
      req.onChatOptions = (msg) => {
        logWrite(
          "cli",
          "dbg",
          `[DIAG] onChatOptions msg.options=${msg.options?.length} prev?=${!!sig.dialogue()}`,
        );
        sig.setDialogue((prev) => {
          if (!prev) {
            return createDialogueState({
              npcId: msg.npcId,
              npcName: msg.npcName,
              chatOptions: msg.options,
              activeTab: responseTab,
              availableTabs: ["chat", "trade"] as DialogueTab[],
            });
          }
          return applyDialogueOptionsToTab(prev, "chat", msg.options, {
            id: msg.npcId,
            name: msg.npcName,
          });
        });
      };
    }
  };

  const handleTradeSelection = (option: TradeOption) => {
    const current = sig.dialogue();
    if (!current) return;
    const itemName = (option.meta?.itemName as string) ?? option.label;
    const detail = tradeOptionDetail(option);
    sig.setDialogue({
      ...current,
      tabs: {
        ...current.tabs,
        trade: {
          ...current.tabs.trade,
          selected: { option, detail },
        },
      },
    });
    if (detail) return;
    rp.sendRequest({ type: "execute", action: "look", params: { target: itemName } }, (req) => {
      req.onCommandResult = (msg) => {
        const detail = msg.events
          .map((e) => e.description)
          .filter(Boolean)
          .join("\n");
        sig.setDialogue((prev) =>
          prev?.tabs.trade.selected?.option.id === option.id
            ? {
                ...prev,
                tabs: {
                  ...prev.tabs,
                  trade: {
                    ...prev.tabs.trade,
                    selected: { ...prev.tabs.trade.selected, detail },
                  },
                },
              }
            : prev,
        );
      };
    });
  };

  const clearTradeSelection = () => {
    sig.setDialogue((prev) => {
      if (!prev?.tabs.trade.selected) return prev;
      return {
        ...prev,
        tabs: {
          ...prev.tabs,
          trade: {
            ...prev.tabs.trade,
            selected: undefined,
          },
        },
      };
    });
  };

  const requestDialogueOptions = (npcId: string) => {
    sig.hideDialogue();
    rp.sendRequest({ type: "request_chat_options", npcId }, (req) => {
      req.onChatOptions = (msg) => {
        sig.showDialogue(
          createDialogueState({
            npcId: msg.npcId,
            npcName: msg.npcName,
            chatOptions: msg.options,
            activeTab: "chat",
            availableTabs: ["chat", "trade"],
          }),
        );
      };
    });
  };

  const chooseDialogueOption = (option: DialogueOption) => {
    const current = sig.dialogue();
    if (!current) return;

    const behavior = getDialogueOptionBehavior(option);
    const expectOptions = behavior.kind === "continue" && behavior.expects === "chat_options";
    const responseTab = responseTabForOptionType(option.type);

    transport.pushEvents([{ type: "say", description: `你：${option.label}` }]);
    if (behavior.kind === "close") {
      sig.hideDialogue();
    } else {
      const activeState =
        responseTab === current.activeTab ? current : { ...current, activeTab: responseTab };
      const withPlayerEntry = {
        ...activeState,
        tabs: {
          ...activeState.tabs,
          chat: {
            ...activeState.tabs.chat,
            history: appendToHistory(activeState, "player", option.label),
          },
        },
      };
      sig.setDialogue(
        expectOptions ? buildLoadingDialogueState(withPlayerEntry, responseTab) : withPlayerEntry,
      );
    }
    rp.sendRequest(
      {
        type: "talk",
        npcId: current.npcId,
        optionId: option.id,
        label: option.label,
        optionType: option.type,
      },
      (req) => buildTalkHandlers(req, expectOptions, responseTab),
    );
  };

  const chooseTradeOption = (option: TradeOption) => {
    const current = sig.dialogue();
    if (!current) return;

    if (option.action === "sell_menu") {
      requestSellOptions(current.npcId);
      return;
    }

    if (!current.tabs.trade.selected) {
      handleTradeSelection(option);
      return;
    }

    if (sig.hasActiveRequest()) return;

    sendTradeAction(current.npcId, option.action as "buy" | "sell", option.meta?.itemId ?? "");
  };

  const sendTradeAction = (npcId: string, action: "buy" | "sell", itemId: string) => {
    rp.sendRequest({ type: "trade", npcId, action, itemId }, (req) => {
      req.onCommandResult = (_msg) => {
        clearTradeSelection();
      };
    });
  };

  const switchDialogueTab = (direction: -1 | 1) => {
    sig.setDialogue((prev) => {
      if (!prev) return prev;
      return computeTabSwitch(prev, direction);
    });
    const dlg = sig.dialogue();
    if (
      dlg?.activeTab === "trade" &&
      dlg.tabs.trade.options.length === 0 &&
      !dlg.tabs.trade.loading
    ) {
      requestTradeOptions(dlg.npcId);
    }
  };

  const requestTradeOptions = (npcId: string) => {
    if (sig.hasActiveRequest()) {
      sig.setPendingDialogueRequest({ npcId, targetTab: "trade" });
      logWrite("cli", "dbg", "[DIAG] requestTradeOptions QUEUED hasActiveRequest=true");
      return;
    }
    sig.setDialogue((prev) => {
      if (!prev || prev.npcId !== npcId) return prev;
      return buildLoadingDialogueState(prev, "trade");
    });
    logWrite("cli", "dbg", `[DIAG] requestTradeOptions npc=${npcId}`);
    rp.sendRequest({ type: "request_trade_options", npcId }, (req) => {
      req.onTradeOptions = (msg) => {
        sig.setDialogue((prev) => {
          if (!prev) return prev;
          return applyTradeOptionsToTab(prev, msg.options, {
            id: msg.npcId,
            name: msg.npcName,
          });
        });
      };
    });
  };

  const requestSellOptions = (npcId: string) => {
    if (sig.hasActiveRequest()) return;
    sig.setDialogue((prev) => {
      if (!prev || prev.npcId !== npcId) return prev;
      return buildLoadingDialogueState(prev, "trade");
    });
    rp.sendRequest({ type: "request_trade_options", npcId }, (req) => {
      req.onTradeOptions = (msg) => {
        sig.setDialogue((prev) => {
          if (!prev) return prev;
          return applyTradeOptionsToTab(prev, msg.options, {
            id: msg.npcId,
            name: msg.npcName,
          });
        });
      };
    });
  };

  const requestFollowUpOptions = (context: string) => {
    const current = sig.dialogue();
    if (!current) return;

    const trimmedContext = context.trim();
    if (!trimmedContext) {
      showFollowUpSelectionRequired();
      return;
    }

    if (sig.hasActiveRequest()) {
      transport.pushEvents([{ type: "system", description: "正在处理操作，请稍候。" }]);
      return;
    }

    const nextPendingFollowUp = {
      npcId: current.npcId,
      context: trimmedContext,
      previousChatOptions: [...current.tabs.chat.options],
    };

    const restoreFollowUpOptions = () => {
      const pending = pendingFollowUp ?? nextPendingFollowUp;
      sig.setDialogue((prev) => {
        if (!prev) return prev;
        return {
          ...clearFollowUpContext(prev),
          tabs: {
            ...prev.tabs,
            chat: {
              ...prev.tabs.chat,
              options: pending.previousChatOptions,
              loading: false,
            },
          },
        };
      });
      pendingFollowUp = null;
    };

    const sent = rp.sendRequest(
      { type: "request_follow_up_options", npcId: current.npcId, context: trimmedContext },
      (req) => {
        pendingFollowUp = nextPendingFollowUp;
        sig.setDialogue((prev) => {
          if (!prev) return prev;
          return buildFollowUpLoadingState(prev);
        });
        req.onError = restoreFollowUpOptions;
        req.onFollowUpOptions = (msg) => {
          const dlg = sig.dialogue();
          if (!dlg || dlg.npcId !== msg.npcId || pendingFollowUp?.context !== msg.context) {
            pendingFollowUp = null;
            rp.completeActiveRequest();
            return;
          }

          if (msg.options.length === 0) {
            restoreFollowUpOptions();
            transport.pushEvents([{ type: "system", description: "没有合适的追问方向。" }]);
            rp.completeActiveRequest();
            return;
          }

          sig.setDialogue((prev) => {
            if (!prev) return prev;
            return applyFollowUpOptions(prev, msg.options, msg.context);
          });
          pendingFollowUp = null;
          rp.completeActiveRequest();
        };
      },
    );
    if (!sent) {
      restoreFollowUpOptions();
    }
  };

  return {
    stashFollowUpSelection,
    popFollowUpSelection,
    showFollowUpSelectionRequired,
    sendDialogueCleanupIfNeeded,
    buildTalkHandlers,
    handleTradeSelection,
    clearTradeSelection,
    requestDialogueOptions,
    chooseDialogueOption,
    chooseTradeOption,
    sendTradeAction,
    switchDialogueTab,
    requestTradeOptions,
    requestSellOptions,
    requestFollowUpOptions,
  };
}
