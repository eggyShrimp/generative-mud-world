export function SectionTitle(props: {
  label: string;
  color: string;
  symbol?: string;
  marginBottom?: number;
}) {
  const symbol = props.symbol ?? "◆";
  const marginBottom = props.marginBottom ?? 1;
  return (
    <text selectable={false} fg={props.color} marginBottom={marginBottom}>
      {symbol} {props.label}
    </text>
  );
}
