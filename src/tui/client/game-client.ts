import { activeLayer, getLayerStack, hasLayer, popLayer, pushLayer } from "../key-layer/index.ts";
import { createCombatSystem } from "./combat.ts";
import { createDialogueOrchestrator } from "./dialogue-orchestrator.ts";
import { applyDialogueOptionsToTab, createDialogueState } from "./dialogue-state.ts";
import { createEndDaySystem } from "./end-day.ts";
import { createRequestPipeline } from "./request-pipeline.ts";
import { createSavePanelSystem } from "./save-panel.ts";
import { createSignals } from "./signals.ts";
import { createTransport } from "./transport.ts";
import type { GameClient, MapGranularity } from "./types.ts";
import { MAP_GRANULARITIES } from "./types.ts";

export * from "./dialogue-state.ts";
export * from "./types.ts";

// ── createGameClient ──
// Shell 负责组装所有子模块并返回 GameClient。业务逻辑已分布到：
// signals.ts · transport.ts · request-pipeline.ts · dialogue-orchestrator.ts

export function createGameClient(url: string): GameClient {
  const sig = createSignals();
  const {
    connectionState,
    entity,
    room,
    capabilities,
    events,
    dialogue,
    setDialogue,
    status,
    selectedEntityId,
    setSelectedEntityId,
    selectedQuestIndex,
    setSelectedQuestIndex,
    mapGranularity,
    setMapGranularity,
    mapCursor,
    setMapCursor,
    selectedInventoryItemId,
    setSelectedInventoryItemId,
    trackedQuestIds,
    questNotification,
    itemChangeNotification,
    combatLog,
    setCombatLog,
    combatRound,
    setCombatRound,
    settlementPending,
    groundRestRecovery,
    itemPropertyLabels,
    endDayOptions,
    setEndDayOptions,
    travelogue,
    selectedTravelogueIndex,
    setSelectedTravelogueIndex,
    bookReader,
    savePanel,
    setSavePanel,
    hasActiveRequest,
    showDialogue,
    hideDialogue,
    showItemChangeNotification,
    dismissItemChangeNotification,
    showQuestNotification,
    dismissQuestNotification,
    openBookReader,
    closeBookReader,
    nextBookPage,
    prevBookPage,
    scrollBookReader,
    toggleTrackQuest,
    isTrackingQuest,
    selectEntity,
  } = sig;

  const transport = createTransport(url, sig);
  const { pushEvents, send } = transport;

  let getRequestTradeOptions: () => ((npcId: string) => void) | undefined = () => undefined;
  const requestPipeline = createRequestPipeline(sig, transport, () => getRequestTradeOptions());
  const { sendRequest, completeActiveRequest } = requestPipeline;

  const dialogueOrch = createDialogueOrchestrator(sig, transport, requestPipeline);
  const {
    stashFollowUpSelection,
    popFollowUpSelection,
    showFollowUpSelectionRequired,
    sendDialogueCleanupIfNeeded,
    clearTradeSelection,
    requestDialogueOptions,
    chooseDialogueOption,
    chooseTradeOption,
    switchDialogueTab,
    requestTradeOptions,
    requestFollowUpOptions,
  } = dialogueOrch;
  getRequestTradeOptions = () => requestTradeOptions;

  const saveSystem = createSavePanelSystem({
    savePanel,
    setSavePanel,
    send,
  });

  const execute = (action: string, params: Record<string, unknown> = {}) => {
    sendRequest({ type: "execute", action, params }, (req) => {
      req.onCommandResult = () => "complete";
    });
  };

  const combat = createCombatSystem({
    entity,
    hasActiveRequest,
    pushEvents,
    pushLayer,
    popLayer,
    execute,
    setSelectedEntityId,
    combatLog: setCombatLog,
    combatRound,
    setCombatRound,
  });

  const endDay = createEndDaySystem({
    entity,
    room,
    groundRestRecovery,
    endDayOptions: setEndDayOptions,
    pushLayer,
    popLayer,
    execute,
  });

  const connect = () => {
    transport.connect({
      combat: {
        pushCombatLog: combat.pushCombatLog,
        checkCombatEnd: combat.checkCombatEnd,
        ensureCombatTimer: combat.ensureCombatTimer,
        endCombat: combat.endCombat,
      },
      saveSystem: {
        selectDefaultSaveSlot: saveSystem.selectDefaultSaveSlot,
      },
      completeActiveRequest,
      hasLayer,
    });
  };

  return {
    connectionState,
    entity,
    room,
    capabilities,
    events,
    dialogue,
    hasActiveRequest,
    status,
    selectedEntityId,
    selectedQuestIndex,
    setSelectedQuestIndex,
    mapGranularity,
    mapCursor,
    selectedInventoryItemId,
    isLayerActive: (id: string) => hasLayer(id),
    activeLayer: () => activeLayer(),
    layerStack: () => getLayerStack(),
    setSelectedEntityId: selectEntity,
    interactWithEntity: (id: string) => {
      const targetEntity = room()?.entities?.find((e) => e.id === id);
      const hasTalk = capabilities().some(
        (c) => c.action === "talk" && (c.params?.values ?? []).includes(id),
      );
      if (targetEntity?.type === "npc" && hasTalk) {
        const npcName = targetEntity.name;
        showDialogue(
          createDialogueState({
            npcId: id,
            npcName,
            activeTab: "chat",
            availableTabs: ["chat", "trade"],
            npcDescription: targetEntity.description ?? targetEntity.typeLabel ?? "人物",
            chatLoading: true,
          }),
        );
        sendRequest({ type: "request_chat_options", npcId: id }, (req) => {
          req.onChatOptions = (msg) => {
            setDialogue((prev) =>
              prev
                ? applyDialogueOptionsToTab(prev, "chat", msg.options, {
                    id: msg.npcId,
                    name: msg.npcName,
                  })
                : createDialogueState({
                    npcId: msg.npcId,
                    npcName: msg.npcName,
                    chatOptions: msg.options,
                    activeTab: "chat",
                    availableTabs: ["chat", "trade"],
                  }),
            );
          };
        });
      } else {
        selectEntity(id);
      }
    },
    openInventory: () => {
      setSelectedEntityId(null);
      pushLayer("inventory");
    },
    closeInventory: () => {
      setSelectedInventoryItemId(null);
      popLayer("inventory");
    },
    openQuests: () => {
      setSelectedEntityId(null);
      setSelectedQuestIndex(null);
      pushLayer("quests");
    },
    closeQuests: () => {
      setSelectedQuestIndex(null);
      popLayer("quests");
    },
    openStatus: () => {
      setSelectedEntityId(null);
      pushLayer("status");
    },
    closeStatus: () => {
      popLayer("status");
    },
    toggleStatus: () => {
      if (hasLayer("status")) {
        popLayer("status");
      } else {
        setSelectedEntityId(null);
        pushLayer("status");
      }
    },
    toggleMinimap: () => {
      if (hasLayer("map")) {
        popLayer("map");
      } else {
        setSelectedEntityId(null);
        setSelectedInventoryItemId(null);
        hideDialogue();
        setMapGranularity("region" as MapGranularity);
        setMapCursor({ x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY });
        pushLayer("map");
      }
    },
    cycleMapGranularity: () => {
      const current = mapGranularity();
      const idx = MAP_GRANULARITIES.indexOf(current);
      setMapGranularity(MAP_GRANULARITIES[(idx + 1) % MAP_GRANULARITIES.length]);
    },
    setMapCursor,
    selectInventoryItem: (id: string) => setSelectedInventoryItemId(id),
    clearInventorySelection: () => setSelectedInventoryItemId(null),
    connect,
    disconnect: () => {
      transport.disconnect({ combat: { endCombat: combat.endCombat } });
    },
    execute,
    requestDialogueOptions,
    chooseDialogueOption,
    chooseTradeOption,
    clearTradeSelection,
    closeDialogue: () => {
      const current = dialogue();
      sendDialogueCleanupIfNeeded(current);
      hideDialogue();
    },
    switchDialogueTab,
    requestTradeOptions,
    stashFollowUpSelection,
    popFollowUpSelection,
    requestFollowUpOptions,
    showFollowUpSelectionRequired,
    trackedQuestIds,
    toggleTrackQuest,
    isTrackingQuest,
    startCombat: combat.startCombat,
    endCombat: combat.endCombat,
    questNotification,
    showQuestNotification,
    dismissQuestNotification,
    itemChangeNotification,
    showItemChangeNotification,
    dismissItemChangeNotification,
    combatLog,
    combatRound,
    settlementPending,
    groundRestRecovery,
    itemPropertyLabels,
    endDayOptions,
    requestEndDay: endDay.requestEndDay,
    confirmEndDay: endDay.confirmEndDay,
    cancelEndDay: endDay.cancelEndDay,
    travelogue,
    bookReader,
    openBookReader,
    closeBookReader,
    nextBookPage,
    prevBookPage,
    scrollBookReader,
    selectedTravelogueIndex,
    setSelectedTravelogueIndex,
    openTravelogue: () => {
      setSelectedEntityId(null);
      setSelectedTravelogueIndex(null);
      send({ type: "request_travelogue" });
      pushLayer("travelogue");
    },
    closeTravelogue: () => {
      setSelectedTravelogueIndex(null);
      popLayer("travelogue");
    },
    saveSlots: () => savePanel().slots,
    selectedSaveSlotIndex: () => savePanel().selectedIndex,
    setSelectedSaveSlotIndex: (index: number | null) => {
      setSavePanel((prev) => ({ ...prev, selectedIndex: index }));
    },
    savePanelLoading: () => savePanel().loading,
    savePanelMessage: () => savePanel().message,
    openSavePanel: () => {
      setSelectedEntityId(null);
      setSelectedInventoryItemId(null);
      hideDialogue();
      pushLayer("save");
      saveSystem.requestSaveSlots();
    },
    closeSavePanel: () => {
      setSavePanel((prev) => ({ ...prev, loading: false }));
      popLayer("save");
    },
    requestSaveSlots: saveSystem.requestSaveSlots,
    manualSave: saveSystem.manualSave,
    createSaveSlot: saveSystem.createSaveSlot,
  };
}
