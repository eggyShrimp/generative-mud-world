// ── Layout Metrics ──
// 布局计算纯函数。输入终端尺寸，输出面板/弹窗的像素级位置信息。
// 不读取任何游戏状态，不依赖 GameClient。

// ── 布局常量 ──

const DESKTOP_MIN_ROOM_HEIGHT = 16;
const DESKTOP_MAX_ROOM_HEIGHT = 24;
const MODAL_MIN_WIDTH = 36;
const MODAL_MAX_WIDTH = 96;
const MODAL_MIN_HEIGHT = 8;
const MODAL_MAX_HEIGHT = 21;
const ROOM_MIN_WIDTH = 52;
const EVENT_LOG_MIN_WIDTH = 30;
const EVENT_LOG_EXCESS_RATIO = 0.4;
const HORIZONTAL_OVERHEAD = 3; // 左右 padding(2) + gap(1)
const BOTTOM_BAR_HEIGHT = 2;

// ── 类型 ──

export interface LayoutMetrics {
  roomHeight: number;
  eventLogHeight: number;
  bottomBarHeight: number;
  sidebarWidth: number;
}

export interface ModalMetrics {
  width: number;
  height: number;
  top: number;
  left: number;
  bodyHeight: number;
}

// ── 函数 ──

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function computeContentHeight(bodyHeight: number, interactionHeight: number): number {
  return Math.max(1, bodyHeight - interactionHeight);
}

export function getLayoutMetrics(terminalWidth: number, terminalHeight: number): LayoutMetrics {
  const rootVerticalPadding = 2;
  const statusHeight = 4;
  const availableHeight = Math.max(
    DESKTOP_MIN_ROOM_HEIGHT,
    terminalHeight - rootVerticalPadding - statusHeight - BOTTOM_BAR_HEIGHT,
  );
  const roomHeight = clamp(availableHeight, DESKTOP_MIN_ROOM_HEIGHT, DESKTOP_MAX_ROOM_HEIGHT);

  const availableWidth = Math.max(1, terminalWidth - HORIZONTAL_OVERHEAD);
  const totalMinWidth = ROOM_MIN_WIDTH + EVENT_LOG_MIN_WIDTH;
  const sidebarWidth =
    availableWidth >= totalMinWidth
      ? EVENT_LOG_MIN_WIDTH + Math.round((availableWidth - totalMinWidth) * EVENT_LOG_EXCESS_RATIO)
      : Math.max(20, Math.round(availableWidth * EVENT_LOG_EXCESS_RATIO));

  return {
    roomHeight,
    eventLogHeight: roomHeight,
    bottomBarHeight: BOTTOM_BAR_HEIGHT,
    sidebarWidth,
  };
}

export function getModalMetrics(
  terminalWidth: number,
  terminalHeight: number,
  layout: LayoutMetrics,
): ModalMetrics {
  const horizontalPadding = 8;
  const width = clamp(
    terminalWidth - horizontalPadding,
    Math.min(MODAL_MIN_WIDTH, Math.max(1, terminalWidth - 2)),
    MODAL_MAX_WIDTH,
  );
  const reservedBottom = layout.bottomBarHeight + 3;
  const minTop = 6;
  const availableHeight = Math.max(MODAL_MIN_HEIGHT, terminalHeight - reservedBottom - minTop);
  const height = clamp(availableHeight, MODAL_MIN_HEIGHT, MODAL_MAX_HEIGHT);
  const left = Math.max(1, Math.floor((terminalWidth - width) / 2));
  const topLimit = Math.max(minTop, terminalHeight - reservedBottom - height);
  const top = Math.max(minTop, topLimit);

  return {
    width,
    height,
    top,
    left,
    bodyHeight: Math.max(3, height - 5),
  };
}

export function getStatusPanelMetrics(
  terminalWidth: number,
  terminalHeight: number,
  layout: LayoutMetrics,
): ModalMetrics {
  const horizontalPadding = 8;
  const width = clamp(
    terminalWidth - horizontalPadding,
    Math.min(MODAL_MIN_WIDTH, Math.max(1, terminalWidth - 2)),
    64,
  );
  const reservedBottom = layout.bottomBarHeight + 3;
  const minTop = 6;
  const availableHeight = Math.max(14, terminalHeight - reservedBottom - minTop);
  const height = clamp(availableHeight, 14, 24);
  const left = Math.max(1, Math.floor((terminalWidth - width) / 2));
  const topLimit = Math.max(minTop, terminalHeight - reservedBottom - height);
  const top = Math.max(minTop, topLimit);

  return {
    width,
    height,
    top,
    left,
    bodyHeight: Math.max(3, height - 5),
  };
}
