export function getChatOptionListHeight(interactionHeight: number): number {
  const tabBarAndGapHeight = 2;
  return Math.max(1, interactionHeight - tabBarAndGapHeight);
}
