export function KeyHint(props: {
  shortcut: string | number;
  label?: string;
  color?: string;
  tag?: string;
  selectable?: boolean;
  onMouseDown?: () => void;
  wrapMode?: "none" | "char" | "word";
}) {
  const suffix = props.tag === "quest" ? "!" : "";
  const fg = props.tag === "quest" ? "#e6a850" : props.color;
  const labelPart = props.label ? ` ${props.label}` : "";
  return (
    <text
      fg={fg}
      selectable={props.selectable}
      onMouseDown={props.onMouseDown}
      wrapMode={props.wrapMode}
    >
      [{props.shortcut}]{labelPart}
      {suffix}
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
