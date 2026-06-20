import type { Accessor, Setter } from "solid-js";
import type { EntityState, RoomInfo } from "../../shared/protocol.ts";
import type { RestOption } from "./game-client.ts";

export interface EndDayDeps {
  entity: Accessor<EntityState | null>;
  room: Accessor<RoomInfo | null>;
  groundRestRecovery: Accessor<number>;
  endDayOptions: Setter<RestOption[]>;
  pushLayer: (id: string) => void;
  popLayer: (id: string) => void;
  execute: (action: string, params?: Record<string, unknown>) => void;
}

export interface EndDaySystem {
  requestEndDay: () => void;
  confirmEndDay: (option: RestOption) => void;
  cancelEndDay: () => void;
}

export function createEndDaySystem(deps: EndDayDeps): EndDaySystem {
  const requestEndDay = () => {
    const currentRoom = deps.room();
    const currentEntity = deps.entity();
    if (!currentRoom || !currentEntity) return;

    const options: RestOption[] = [];

    for (const action of currentRoom.roomActions ?? []) {
      if (action.endsDay && action.restRecovery) {
        options.push({
          type: "room",
          actionId: action.id,
          label: action.label,
          restRecovery: action.restRecovery,
        });
      }
    }

    for (const item of currentEntity.inventory ?? []) {
      if (item.properties.restItem) {
        options.push({
          type: "item",
          itemId: item.id,
          label: `使用${item.name}`,
          restRecovery: Number(item.properties.restRecovery ?? 0),
          durability: item.properties.durability as number | undefined,
        });
      }
    }

    options.push({
      type: "ground",
      label: "原地休息",
      restRecovery: deps.groundRestRecovery(),
    });

    options.sort((a, b) => b.restRecovery - a.restRecovery);

    deps.endDayOptions(options);
    deps.pushLayer("confirm-end-day");
  };

  const confirmEndDay = (option: RestOption) => {
    deps.endDayOptions([]);
    deps.popLayer("confirm-end-day");

    if (option.type === "ground") {
      deps.execute("end_day");
    } else if (option.type === "item") {
      deps.execute("end_day", { context: "item", itemId: option.itemId });
    } else if (option.type === "room" && option.actionId) {
      deps.execute(option.actionId);
    }
  };

  const cancelEndDay = () => {
    deps.endDayOptions([]);
    deps.popLayer("confirm-end-day");
  };

  return {
    requestEndDay,
    confirmEndDay,
    cancelEndDay,
  };
}
