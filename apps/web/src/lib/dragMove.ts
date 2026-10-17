// Translates a drag-and-drop gesture between two items into list indexes, or null for no move.
export const dragMove = (
  ids: readonly string[],
  activeId: string,
  overId: string | null,
): { from: number; to: number } | null => {
  if (!overId || overId === activeId) return null;
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  return from === -1 || to === -1 ? null : { from, to };
};
