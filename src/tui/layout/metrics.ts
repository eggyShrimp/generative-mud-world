// ── Layout Metrics ──
// 布局计算纯函数。输入终端尺寸，输出面板/弹窗的像素级位置信息。
// 不读取任何游戏状态，不依赖 GameClient。

// ── 布局常量 ──
// 宽屏/窄屏的房间面板和事件日志高度约束，以及弹窗尺寸约束。

const DESKTOP_MIN_ROOM_HEIGHT = 16;
const DESKTOP_MAX_ROOM_HEIGHT = 24;
const DESKTOP_MIN_EVENT_LOG_HEIGHT = 6;
const NARROW_MIN_ROOM_HEIGHT = 10;
const NARROW_MAX_ROOM_HEIGHT = 18;
const NARROW_MIN_EVENT_LOG_HEIGHT = 4;
const MODAL_MIN_WIDTH = 36;
const MODAL_MAX_WIDTH = 96;
const MODAL_MIN_HEIGHT = 8;
const MODAL_MAX_HEIGHT = 18;

// ── 类型 ──

export interface LayoutMetrics {
  roomHeight: number;
  eventLogHeight: number;
}

export interface ModalMetrics {
  width: number;
  height: number;
  top: number;
  left: number;
  bodyHeight: number;
  narrow: boolean;
}

// ── 函数 ──

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * 计算内容区高度：弹窗 body 高度减去交互区高度。
 */
export function computeContentHeight(bodyHeight: number, interactionHeight: number): number {
  return Math.max(1, bodyHeight - interactionHeight);
}

/**
 * 计算房间面板和事件日志的高度分配。
 * 窄屏：房间占 62%，最小 10 最大 18。
 * 宽屏：房间占 68%，最小 16 最大 24。
 */
export function getLayoutMetrics(terminalHeight: number, narrow: boolean): LayoutMetrics {
  if (narrow) {
    const compactStatusHeight = 1;
    const actionBarHeight = 1;
    const availableHeight = Math.max(
      NARROW_MIN_ROOM_HEIGHT + NARROW_MIN_EVENT_LOG_HEIGHT,
      terminalHeight - compactStatusHeight - actionBarHeight,
    );
    const roomHeight = clamp(
      Math.round(availableHeight * 0.62),
      NARROW_MIN_ROOM_HEIGHT,
      NARROW_MAX_ROOM_HEIGHT,
    );

    return {
      roomHeight,
      eventLogHeight: Math.max(NARROW_MIN_EVENT_LOG_HEIGHT, availableHeight - roomHeight),
    };
  }

  const rootVerticalPadding = 2;
  const statusHeight = 4;
  const availableHeight = Math.max(
    DESKTOP_MIN_ROOM_HEIGHT + DESKTOP_MIN_EVENT_LOG_HEIGHT,
    terminalHeight - rootVerticalPadding - statusHeight,
  );
  const roomHeight = clamp(
    Math.round(availableHeight * 0.68),
    DESKTOP_MIN_ROOM_HEIGHT,
    DESKTOP_MAX_ROOM_HEIGHT,
  );

  return {
    roomHeight,
    eventLogHeight: Math.max(DESKTOP_MIN_EVENT_LOG_HEIGHT, availableHeight - roomHeight),
  };
}

/**
 * 计算通用弹窗的尺寸和位置。
 * 宽度：屏幕宽度减去水平内边距，36-96 范围内。
 * 高度：扣除事件日志和顶部预留后可用空间，8-18 范围内。
 */
export function getModalMetrics(
  terminalWidth: number,
  terminalHeight: number,
  layout: LayoutMetrics,
  narrow: boolean,
): ModalMetrics {
  const horizontalPadding = narrow ? 2 : 8;
  const width = clamp(
    terminalWidth - horizontalPadding,
    Math.min(MODAL_MIN_WIDTH, Math.max(1, terminalWidth - 2)),
    MODAL_MAX_WIDTH,
  );
  const reservedBottom = layout.eventLogHeight + (narrow ? 2 : 3);
  const minTop = narrow ? 2 : 6;
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
    narrow,
  };
}

/**
 * 计算状态面板的尺寸。比通用弹窗更窄更高（64 列宽，14-24 行高）。
 */
export function getStatusPanelMetrics(
  terminalWidth: number,
  terminalHeight: number,
  layout: LayoutMetrics,
  narrow: boolean,
): ModalMetrics {
  const horizontalPadding = narrow ? 2 : 8;
  const width = clamp(
    terminalWidth - horizontalPadding,
    Math.min(MODAL_MIN_WIDTH, Math.max(1, terminalWidth - 2)),
    64,
  );
  const reservedBottom = layout.eventLogHeight + (narrow ? 2 : 3);
  const minTop = narrow ? 2 : 6;
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
    narrow,
  };
}
