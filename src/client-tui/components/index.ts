/**
 * TUI 公共组件
 *
 * 跨面板可复用的 UI 原子组件，颜色全部通过 prop 传入，不依赖 THEME 常量。
 *
 * - **SectionTitle** — 板块标题（H2 层级），符号前缀 + marginBottom
 * - **Section** — 板块容器：SectionTitle + flex column 正文包裹
 * - **BarRow** — 三列数据行：label + bar + value
 * - **EmptyState** — 节内空状态行
 * - **KeyHint** — 快捷键提示 `[{shortcut}] {label}`，单 text 元素
 * - **KeyHintRow** — 快捷键提示行，key/label 分列渲染（独立 width 控制）
 * - **formatKeyBracket** — 纯工具：生成 `[{key}]` 字符串（非 JSX 场景）
 */

export { BarRow } from "./bar-row.tsx";
export { EmptyState } from "./empty-state.tsx";
export { formatKeyBracket, KeyHint, KeyHintRow } from "./key-hint.tsx";
export { LoadingHint } from "./loading-hint.tsx";
export { Section } from "./section.tsx";
export { SectionTitle } from "./section-title.tsx";
