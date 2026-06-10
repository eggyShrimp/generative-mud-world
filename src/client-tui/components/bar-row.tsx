/**
 * label + bar + value 三列行
 *
 * 用于需求、特性、战斗 HP 等 label-bar-value 模式。
 * 列宽由调用方的节级 COLUMNS 常量传入，保证节内统一。
 */
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
