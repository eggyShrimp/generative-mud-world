export function EmptyState(props: { type: string; color: string; paddingLeft?: number }) {
  const indent = props.paddingLeft ?? 2;
  return (
    <text selectable={false} fg={props.color} paddingLeft={indent}>
      {`无${props.type}`}
    </text>
  );
}
