import { For, Show } from "solid-js";
import type { GameClient } from "../../client/game-client.ts";
import { KeyHint, LoadingHint } from "../../components/index.ts";
import type { ModalMetrics } from "../../layout/metrics.ts";
import { PopupPanel } from "../../layout/popup-panel.tsx";
import { THEME } from "../../theme/theme.ts";

function formatSavedAt(seconds: number): string {
  if (seconds <= 0) return "未知";
  const date = new Date(seconds * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SavePanel(props: { client: GameClient; metrics: ModalMetrics }) {
  const slots = () => props.client.saveSlots();
  const selectedIndex = () => props.client.selectedSaveSlotIndex();
  const selectedSlot = () => {
    const idx = selectedIndex();
    return idx !== null ? (slots()[idx] ?? null) : null;
  };

  return (
    <Show when={props.client.isLayerActive("save")}>
      <PopupPanel
        title="存档"
        borderColor="#8fb9e8"
        backgroundColor={THEME.panel}
        width={props.metrics.width}
        height={props.metrics.height}
        top={props.metrics.top}
        left={props.metrics.left}
        footer="[1-9]选择 [s]保存 [r]刷新 [n]新建 [v/Esc]关闭"
      >
        <Show
          when={!props.client.savePanelLoading()}
          fallback={<LoadingHint color={THEME.muted} text="正在处理..." />}
        >
          <box flexDirection="row" height={props.metrics.bodyHeight}>
            <scrollbox
              height={props.metrics.bodyHeight}
              width={34}
              scrollY
              borderColor={THEME.borderMuted}
            >
              <Show
                when={slots().length > 0}
                fallback={
                  <text fg={THEME.muted} paddingLeft={1}>
                    暂无存档。按 [n] 创建新存档，或按 [s] 保存当前进度。
                  </text>
                }
              >
                <For each={slots().slice(0, 9)}>
                  {(slot, i) => {
                    const selected = () => selectedIndex() === i();
                    const current = () => (slot.isCurrent ? "*" : " ");
                    return (
                      <box
                        flexDirection="column"
                        paddingLeft={1}
                        onMouseDown={() => props.client.setSelectedSaveSlotIndex(i())}
                      >
                        <box flexDirection="row">
                          <text fg={selected() ? "#8fb9e8" : THEME.title} wrapMode="word">
                            {`${selected() ? ">" : " "} ${i() + 1}. ${current()} ${slot.slotId}`}
                          </text>
                        </box>
                        <text fg={slot.valid ? THEME.dim : "#c45b5b"}>
                          {slot.valid
                            ? `    ${formatSavedAt(slot.savedAt)}  第${slot.round}轮`
                            : "    无法读取"}
                        </text>
                      </box>
                    );
                  }}
                </For>
              </Show>
            </scrollbox>

            <scrollbox
              border={["left"]}
              borderColor={THEME.borderMuted}
              paddingLeft={2}
              marginLeft={1}
              height={props.metrics.bodyHeight}
              flexGrow={1}
              scrollY
            >
              <Show
                when={selectedSlot()}
                fallback={
                  <box flexDirection="column" gap={1}>
                    <text fg={THEME.title}>当前没有选中存档</text>
                    <text fg={THEME.muted}>按 [s] 可保存到当前运行中的存档。</text>
                  </box>
                }
              >
                <box flexDirection="column" gap={1}>
                  <text fg="#8fb9e8">{selectedSlot()?.slotId}</text>
                  <text fg={THEME.muted}>
                    {selectedSlot()?.isCurrent ? "当前运行存档" : "非当前存档"}
                  </text>
                  <text fg={THEME.text}>世界：{selectedSlot()?.worldId || "未知"}</text>
                  <text fg={THEME.text}>时间：{formatSavedAt(selectedSlot()?.savedAt ?? 0)}</text>
                  <text fg={THEME.text}>轮次：第 {selectedSlot()?.round ?? 0} 轮</text>
                  <text fg={THEME.text}>Tick：{selectedSlot()?.gameTick ?? 0}</text>
                  <text fg={THEME.text}>对话摘要：{selectedSlot()?.summaryCount ?? 0}</text>
                  <text fg={selectedSlot()?.valid ? THEME.text : "#c45b5b"}>
                    状态：{selectedSlot()?.valid ? "可读取" : "损坏或版本不匹配"}
                  </text>
                  <box height={1} />
                  <box flexDirection="row" gap={1} flexWrap="wrap">
                    <KeyHint shortcut="S" label="保存当前进度" color="#8fb9e8" selectable={false} />
                    <KeyHint shortcut="R" label="刷新列表" color={THEME.muted} selectable={false} />
                    <KeyHint shortcut="N" label="新建存档" color={THEME.muted} selectable={false} />
                  </box>
                  <Show when={props.client.savePanelMessage()}>
                    <text fg={THEME.muted} wrapMode="word">
                      {props.client.savePanelMessage()}
                    </text>
                  </Show>
                </box>
              </Show>
            </scrollbox>
          </box>
        </Show>
      </PopupPanel>
    </Show>
  );
}
