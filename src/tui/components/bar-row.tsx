export function BarRow(props: {
  label: string;
  bar: string;
  value: string;
  labelWidth: number;
  barWidth: number;
  valueWidth: number;
  color: string;
  valueColor?: string;
  paddingLeft?: number;
  valueGap?: number;
}) {
  const indent = props.paddingLeft ?? 2;
  const valueGap = props.valueGap ?? 1;
  return (
    <box flexDirection="row" paddingLeft={indent}>
      <text selectable={false} fg={props.color} width={props.labelWidth}>
        {props.label}
      </text>
      <text selectable={false} fg={props.color} width={props.barWidth}>
        {props.bar}
      </text>
      <text selectable={false} width={valueGap}>
        {" ".repeat(valueGap)}
      </text>
      <text selectable={false} fg={props.valueColor ?? props.color} width={props.valueWidth}>
        {props.value}
      </text>
    </box>
  );
}
