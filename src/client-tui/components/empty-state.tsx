/**
 * 节内空状态行
 *
 * 统一格式：`无{type}`，缩进与数据行一致。
 */
export function EmptyState(props: { type: string; color: string; paddingLeft?: number }) {
  const indent = props.paddingLeft ?? 2;
  return (
    <text selectable={false} fg={props.color} paddingLeft={indent}>
      {`无${props.type}`}
    </text>
  );
}
