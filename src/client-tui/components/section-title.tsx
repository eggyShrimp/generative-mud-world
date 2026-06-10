/**
 * TUI 排版体系 — 层级 H2：板块标题
 *
 * 排版规则:
 * - 符号前缀默认 "◆"，可通过 symbol prop 覆盖
 * - 与正文间距 TITLE_TO_CONTENT_GAP = 1（marginBottom 默认值）
 * - 上距由外部 `<box height={1} />` 控制（板块间隔）
 * - 颜色通过 prop 传入，不依赖 THEME 常量
 *
 * 层级体系:
 *   L1 — PopupPanel border title (终端边框标题)
 *   L2 — SectionTitle ◆ (板块标题，本组件)
 *   L3 — Sub-section divider ─── (次级分隔线，待建)
 *   L4 — Body / List item (正文/列表行)
 *
 * 间距常量（全局一致）:
 *   SECTION_BREAK          = 1  板块间隔 (<box height={1} />)
 *   TITLE_TO_CONTENT_GAP   = 1  标题到正文 (marginBottom)
 *   ITEM_GAP               = 1  正文行/列表项间距 (gap)
 *   BLOCK_INDENT           = 2  正文块左缩进 (paddingLeft)
 */
export function SectionTitle(props: {
  label: string;
  color: string;
  symbol?: string;
  marginBottom?: number;
}) {
  const symbol = props.symbol ?? "◆";
  const marginBottom = props.marginBottom ?? 1;
  return (
    <text selectable={false} fg={props.color} marginBottom={marginBottom}>
      {symbol} {props.label}
    </text>
  );
}
