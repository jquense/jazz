import { distance } from 'fastest-levenshtein';

export function closest(
  item: string,
  list: Iterable<string>,
  maxDistance = 2,
) {
  let min = Infinity;
  let minItem: string | null = null;
  for (const other of list) {
    const next = distance(item, other);
    if (next >= min) continue;
    min = next;
    minItem = other;
  }
  return min <= maxDistance ? minItem : null;
}
