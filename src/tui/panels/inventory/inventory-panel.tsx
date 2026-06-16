// ── InventoryPanel ──
// 背包面板：物品列表 + 物品详情 + 动作按钮。
// 选中物品前显示列表，选中后左侧列表 + 右侧详情（宽屏）或上下排列（窄屏）。

import { For, Show } from "solid-js";
import type { GameClient } from "../../client/game-client.ts";
import { KeyHint, KeyHintRow } from "../../components/index.ts";
import { formatGroupedItemName, type GroupedItem } from "../../features/inventory/grouping.ts";
import { buildInventoryItemDetail } from "../../features/items/detail.ts";
import { getInventoryActions } from "../../key-layer/index.ts";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { PopupPanel } from "../../layout/popup-panel.tsx";
import { THEME } from "../../theme/theme.ts";

// ── InventoryDetail ──
// 物品详情区：名称 + 描述 + 可用操作列表。

function InventoryDetail(props: { client: GameClient; group: GroupedItem; height: number }) {
  const representative = props.group.items[0];
  const detail = () => buildInventoryItemDetail(representative, props.client.itemPropertyLabels());
  return (
    <scrollbox
      border={["left"]}
      borderColor={THEME.borderMuted}
      paddingLeft={1}
      marginLeft={1}
      height={props.height}
      flexGrow={1}
      scrollY
    >
      <text fg={THEME.title} wrapMode="word">
        {formatGroupedItemName(props.group)}
      </text>
      <text fg={THEME.text} wrapMode="word">
        {detail()}
      </text>
      <For each={getInventoryActions(props.group, props.client.capabilities())}>
        {(action, index) => (
          <KeyHint
            shortcut={index() + 1}
            label={action.label}
            color={action.color ?? THEME.text}
            selectable={false}
            onMouseDown={() => {
              action.run(props.client, props.group);
              props.client.closeInventory();
            }}
          />
        )}
      </For>
    </scrollbox>
  );
}

// ── InventoryList ──
// 物品列表：序号 + 名称（含数量堆叠），选中行高亮。

function InventoryList(props: {
  items: GroupedItem[];
  selectedGroupName?: string;
  onSelect: (group: GroupedItem) => void;
}) {
  return (
    <Show
      when={props.items.length > 0}
      fallback={
        <text selectable={false} fg={THEME.dim}>
          背包是空的。
        </text>
      }
    >
      <box flexDirection="column">
        <For each={props.items}>
          {(group, index) => {
            const selected = () => props.selectedGroupName === group.name;
            return (
              <box flexDirection="row" onMouseDown={() => props.onSelect(group)}>
                <text selectable={false} fg={selected() ? THEME.focus : THEME.dim} width={2}>
                  {selected() ? ">" : " "}
                </text>
                <KeyHintRow
                  shortcut={index() + 1}
                  label={formatGroupedItemName(group)}
                  color={selected() ? THEME.focus : THEME.text}
                />
              </box>
            );
          }}
        </For>
      </box>
    </Show>
  );
}

// ── InventoryPanel ──
// 背包面板主组件。isLayerActive("inventory") 时显示。

export function InventoryPanel(props: {
  client: GameClient;
  items: GroupedItem[];
  selectedItem: GroupedItem | null;
  metrics: ModalMetrics;
}) {
  return (
    <Show when={props.client.isLayerActive("inventory")}>
      <PopupPanel
        title="背包"
        borderColor={THEME.border}
        backgroundColor={THEME.panel}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        footer={
          props.selectedItem ? "↑↓ 切换物品，1-9 操作，Esc 返回" : "选择物品编号，↑↓ 切换，Esc 关闭"
        }
      >
        <Show
          when={props.selectedItem}
          fallback={
            <scrollbox height={props.metrics.bodyHeight} scrollY>
              <InventoryList
                items={props.items}
                selectedGroupName={props.selectedItem?.name}
                onSelect={(group) => props.client.setSelectedInventoryItemId(group.items[0].id)}
              />
            </scrollbox>
          }
        >
          {(group: () => GroupedItem) => (
            <box flexDirection={"row"} height={props.metrics.bodyHeight}>
              <scrollbox height={props.metrics.bodyHeight} width={24} scrollY>
                <InventoryList
                  items={props.items}
                  selectedGroupName={group().name}
                  onSelect={(candidate) =>
                    props.client.setSelectedInventoryItemId(candidate.items[0].id)
                  }
                />
              </scrollbox>
              <InventoryDetail
                client={props.client}
                group={group()}
                height={props.metrics.bodyHeight}
              />
            </box>
          )}
        </Show>
      </PopupPanel>
    </Show>
  );
}
