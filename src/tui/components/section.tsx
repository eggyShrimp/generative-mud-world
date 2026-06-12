import { SectionTitle } from "./section-title.tsx";

export function Section(props: {
  title: string;
  color: string;
  children: unknown;
  symbol?: string;
  titleMarginBottom?: number;
}) {
  return (
    <box flexDirection="column">
      <SectionTitle
        label={props.title}
        color={props.color}
        symbol={props.symbol}
        marginBottom={props.titleMarginBottom}
      />
      {props.children as never}
    </box>
  );
}
