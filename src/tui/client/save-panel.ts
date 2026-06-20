import type { Accessor, Setter } from "solid-js";
import type { SaveSlotInfo } from "../../shared/protocol.ts";
import type { SavePanelState } from "./game-client.ts";

export interface SavePanelDeps {
  savePanel: Accessor<SavePanelState>;
  setSavePanel: Setter<SavePanelState>;
  send: (data: unknown) => boolean;
}

export interface SavePanelSystem {
  selectDefaultSaveSlot: (slots: SaveSlotInfo[]) => number | null;
  makeSlotId: () => string;
  requestSaveSlots: () => void;
  manualSave: () => void;
  createSaveSlot: () => void;
}

export function createSavePanelSystem(deps: SavePanelDeps): SavePanelSystem {
  const selectDefaultSaveSlot = (slots: SaveSlotInfo[]): number | null => {
    if (slots.length === 0) return null;
    const current = slots.findIndex((slot) => slot.isCurrent);
    return current >= 0 ? current : 0;
  };

  const makeSlotId = (): string => {
    const date = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `slot_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  };

  const requestSaveSlots = () => {
    deps.setSavePanel((prev) => ({ ...prev, loading: true, message: null }));
    if (!deps.send({ type: "request_save_slots" })) {
      deps.setSavePanel((prev) => ({ ...prev, loading: false }));
    }
  };

  const manualSave = () => {
    const panel = deps.savePanel();
    const slot = panel.selectedIndex !== null ? panel.slots[panel.selectedIndex] : null;
    const slotId = slot?.slotId;
    deps.setSavePanel((prev) => ({
      ...prev,
      loading: true,
      message: slotId ? `正在保存到 ${slotId}...` : "正在保存...",
    }));
    if (!deps.send({ type: "manual_save", slotId })) {
      deps.setSavePanel((prev) => ({ ...prev, loading: false }));
    }
  };

  const createSaveSlot = () => {
    const slotId = makeSlotId();
    deps.setSavePanel((prev) => ({ ...prev, loading: true, message: `正在创建 ${slotId}...` }));
    if (!deps.send({ type: "create_save_slot", slotId })) {
      deps.setSavePanel((prev) => ({ ...prev, loading: false }));
    }
  };

  return {
    selectDefaultSaveSlot,
    makeSlotId,
    requestSaveSlots,
    manualSave,
    createSaveSlot,
  };
}
