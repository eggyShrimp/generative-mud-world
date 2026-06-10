/**
 * TUI 排版体系 — H2 复合组件：板块标题 + 正文容器
 *
 * 组合 SectionTitle + `<box flexDirection="column">` 包裹 children。
 * 正文的 gap/paddingLeft 由子元素自身管理（避免与 BarRow/EmptyState 内置 paddingLeft 冲突）。
 *
 * 排版常量见 section-title.tsx。
 */
import { SectionTitle } from "./section-title.tsx";

export function Section(props: {
  title: string;
  color: string;
  children: unknown;
  symbol?: string;
  titleMarginBottom?: number;
}) {
  return (
    <box flexDirection="column">
      <SectionTitle
        label={props.title}
        color={props.color}
        symbol={props.symbol}
        marginBottom={props.titleMarginBottom}
      />
      {props.children as never}
    </box>
  );
}
