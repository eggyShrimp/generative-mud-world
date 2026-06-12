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

export function formatKeyBracket(key: string | number): string {
  return `[${key}]`;
}
