/**
 * 快捷键提示组件
 */

/**
 * `[{shortcut}] {label}` 单行文本
 *
 * 适用于不需要独立控制 key/label 宽度或颜色的场景。
 */
export function KeyHint(props: {
  shortcut: string | number;
  label?: string;
  color?: string;
  selectable?: boolean;
  onMouseDown?: () => void;
  wrapMode?: "none" | "char" | "word";
}) {
  const labelPart = props.label ? ` ${props.label}` : "";
  return (
    <text
      fg={props.color}
      selectable={props.selectable}
      onMouseDown={props.onMouseDown}
      wrapMode={props.wrapMode}
    >
      [{props.shortcut}]{labelPart}
    </text>
  );
}

/**
 * 快捷键提示行：key 和 label 分别渲染在独立 `<text>` 中
 *
 * 返回 box 布局，调用方可直接作为子元素使用。
 * 适用于需要独立控制 key/label 宽度的场景（如列表序号 + 名称）。
 */
export function KeyHintRow(props: {
  shortcut: string | number;
  label: string;
  color?: string;
  keyWidth?: number;
}) {
  const keyWidth = props.keyWidth ?? 5;
  return (
    <box flexDirection="row">
      <text selectable={false} fg={props.color} width={keyWidth}>
        [{props.shortcut}]
      </text>
      <text selectable={false} fg={props.color}>
        {props.label}
      </text>
    </box>
  );
}

/**
 * 生成 `[{key}]` 格式字符串，供非 JSX 场景（如 entity-list-layout）使用
 */
export function formatKeyBracket(key: string | number): string {
  return `[${key}]`;
}
