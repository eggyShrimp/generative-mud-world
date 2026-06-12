export function LoadingHint(props: { text?: string; color: string }) {
  return (
    <text selectable={false} fg={props.color}>
      {props.text ?? "加载中..."}
    </text>
  );
}
