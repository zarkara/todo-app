// Returns a new list with the item at `from` moved to `to`; out-of-range moves are ignored.
export const moveItem = <T>(items: readonly T[], from: number, to: number): T[] => {
  const isInRange = (index: number) => index >= 0 && index < items.length;
  if (!isInRange(from) || !isInRange(to)) return [...items];

  const remaining = items.filter((_, index) => index !== from);
  return [...remaining.slice(0, to), ...items.slice(from, from + 1), ...remaining.slice(to)];
};
