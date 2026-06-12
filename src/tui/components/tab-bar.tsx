// ── TabBar ──
// 通用 Tab 栏组件：显示标签页列表，当前激活项高亮。
// 纯显示组件，不读取游戏状态。

import { THEME } from "../theme/theme.ts";

export function TabBar(props: { tabs: string[]; active: string; labels?: Record<string, string> }) {
  const getLabel = (tab: string) => props.labels?.[tab] ?? tab;

  return (
    <box flexDirection="row">
      <text selectable={false} fg={THEME.dim}>
        {"\u2501\u2501 "}
      </text>
      {props.tabs.map((tab, i) => (
        <>
          {i > 0 ? <text fg={THEME.borderMuted}> │ </text> : null}
          <text fg={tab === props.active ? THEME.focus : THEME.dim}>{getLabel(tab)}</text>
        </>
      ))}
      <text selectable={false} fg={THEME.dim}>
        {" \u2501\u2501"}
      </text>
    </box>
  );
}
