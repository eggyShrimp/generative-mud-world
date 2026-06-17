import { createMemo } from "solid-js";

export function formatKeyHintText(shortcut: string | number, label?: string, tag?: string) {
  const labelPart = label ? ` ${label}` : "";
  const badge = tag === "quest" ? " [!]" : "";
  return `[${shortcut}]${labelPart}${badge}`;
}

export function keyHintColor(tag?: string, color?: string) {
  return tag === "quest" ? "#e6a850" : color;
}

export function KeyHint(props: {
  shortcut: string | number;
  label?: string;
  color?: string;
  tag?: string;
  selectable?: boolean;
  onMouseDown?: () => void;
  wrapMode?: "none" | "char" | "word";
}) {
  const fg = createMemo(() => keyHintColor(props.tag, props.color));
  return (
    <text
      fg={fg()}
      selectable={props.selectable}
      onMouseDown={props.onMouseDown}
      wrapMode={props.wrapMode}
    >
      {formatKeyHintText(props.shortcut, props.label, props.tag)}
    </text>
  );
}

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

export { formatKeyBracket } from "../utils/format-key-bracket.ts";
