import type { RoomEntity } from "../../../shared/protocol.ts";
import { formatKeyBracket } from "../../utils/format-key-bracket.ts";
import { formatRelationText } from "./relation-format.ts";

// ── Column Widths ──
// 实体列表和出口列表共享的列宽定义。
// selector: 选中指示器宽度（"> "）
// index: 序号列宽度（"[1]"）
// name: 名称列宽度（截断超长名称）
// type: 类型列宽度（" · 人物"）
// relation: 关系列宽度（" · 友好+55"）

export const ENTITY_LIST_COLUMNS = {
  selector: 2,
  index: 5,
  name: 16,
  type: 8,
  relation: 16,
} as const;

type EntityRelation = { targetId: string; level: number; label?: string | null };
type ExitInfo = {
  to: string;
  directionLabel: string;
  distance: number;
  terrain?: string;
  terrainLabel?: string;
  destinationName?: string;
};

export interface EntityListRow {
  entity: RoomEntity;
  indexLabel: string;
  selected: boolean;
  nameText: string;
  typeLabel: string;
  typeText: string;
  relation?: EntityRelation;
  relationText: string;
}

export interface ExitListRow {
  direction: string;
  keyText: string;
  directionText: string;
  typeText: string;
  relationText: string;
}

export function buildEntityListRows(
  entities: RoomEntity[],
  selectedEntityId?: string,
  relations: EntityRelation[] = [],
): EntityListRow[] {
  const relationByTargetId = new Map(relations.map((relation) => [relation.targetId, relation]));

  return entities.map((entity, index) => {
    const relation = entity.type === "npc" ? relationByTargetId.get(entity.id) : undefined;

    return {
      entity,
      indexLabel: formatKeyBracket(index + 1),
      selected: selectedEntityId === entity.id,
      nameText: truncateDisplayText(entity.name, ENTITY_LIST_COLUMNS.name),
      typeLabel: entity.typeLabel ?? entity.type,
      typeText: truncateDisplayText(
        ` · ${entity.typeLabel ?? entity.type}`,
        ENTITY_LIST_COLUMNS.type,
      ),
      relation,
      relationText: relation
        ? truncateDisplayText(formatRelationText(relation), ENTITY_LIST_COLUMNS.relation)
        : "",
    };
  });
}

export function buildExitListRows(
  exits: Record<string, ExitInfo>,
  keyForDirection: (direction: string) => string,
): ExitListRow[] {
  return Object.entries(exits).map(([direction, exit]) => ({
    direction,
    keyText: formatKeyBracket(keyForDirection(direction)),
    directionText: truncateDisplayText(exit.directionLabel, ENTITY_LIST_COLUMNS.name),
    typeText: truncateDisplayText(formatExitTypeText(exit), ENTITY_LIST_COLUMNS.type),
    relationText: truncateDisplayText(
      formatExitDestinationText(exit),
      ENTITY_LIST_COLUMNS.relation,
    ),
  }));
}

function formatExitTypeText(exit: ExitInfo): string {
  const terrainLabel = exit.terrainLabel ?? exit.terrain ?? "";
  const dist = exit.distance > 1 ? `${exit.distance}格` : "";
  const extra = [terrainLabel, dist].filter(Boolean).join(" · ");
  return extra ? ` · ${extra}` : "";
}

function formatExitDestinationText(exit: ExitInfo): string {
  return exit.destinationName ? ` → ${exit.destinationName}` : "";
}

export function truncateDisplayText(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (displayWidth(text) <= maxWidth) return text;
  if (maxWidth === 1) return "…";

  let result = "";
  let width = 0;
  const suffixWidth = 1;

  for (const char of text) {
    const charWidth = displayWidth(char);
    if (width + charWidth + suffixWidth > maxWidth) break;
    result += char;
    width += charWidth;
  }

  return `${result}…`;
}

function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += isWideCharacter(char) ? 2 : 1;
  }
  return width;
}

function isWideCharacter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}
