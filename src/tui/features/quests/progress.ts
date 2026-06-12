// ── features/quests/progress.ts ──
// 任务进度文本格式化纯函数。不依赖 GameClient 或 UI 框架。

/**
 * 任务状态中文标签。
 */
export function statusLabel(status: string): string {
  if (status === "active") return "进行中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "已失败";
  return status;
}

/**
 * 目标进度文本：当前完成数/总目标数。
 */
export function objectiveProgressText(current: number, count: number): string {
  return `${Math.min(current, count)}/${count}`;
}
