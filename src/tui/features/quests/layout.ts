// ── QuestsPanel Layout ──
// 任务面板布局计算。不读取任何游戏状态，不依赖 GameClient。

// ── 布局常量 ──

const POPUP_OVERHEAD = 4; // PopupPanel border(2) + padding(2)
const LIST_WIDTH = 28; // 左侧任务列表宽度
const DETAIL_GAP = 2; // 右侧详情区 marginLeft(1) + border "left"(1)

// ── 类型 ──

export interface QuestsPanelLayout {
  contentWidth: number;
  listWidth: number;
  detailWidth: number;
}

// ── 函数 ──

export function getQuestsPanelLayout(panelWidth: number): QuestsPanelLayout {
  const contentWidth = Math.max(1, panelWidth - POPUP_OVERHEAD);
  const listWidth = LIST_WIDTH;
  return {
    contentWidth,
    listWidth,
    detailWidth: Math.max(1, contentWidth - listWidth - DETAIL_GAP),
  };
}
