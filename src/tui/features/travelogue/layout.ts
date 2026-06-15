export interface TraveloguePanelLayout {
  contentWidth: number;
  listWidth: number;
  detailWidth: number;
}

export function getTraveloguePanelLayout(panelWidth: number): TraveloguePanelLayout {
  const contentWidth = Math.max(1, panelWidth - 4);
  const listWidth = Math.min(28, Math.max(14, Math.floor(contentWidth * 0.36)));
  return {
    contentWidth,
    listWidth,
    detailWidth: Math.max(1, contentWidth - listWidth - 2),
  };
}

export function formatTravelogueLocationLine(locationNames: string[]): string | null {
  return locationNames.length > 0 ? `途经：${locationNames.join(" → ")}` : null;
}
