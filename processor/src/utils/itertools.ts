export type Predicate<T> = (item: T) => boolean;
export type Primitive = string | number | boolean;

/**
 * Returns an iterator that filters elements from iterable returning only those
 * for which the predicate is true.
 */
export function* filter<T>(
  iterable: Iterable<T>,
  predicate: Predicate<T>,
): Iterable<T> {
  for (const value of iterable) {
    if (predicate(value)) yield value;
  }
}

/**
 * Returns an iterator that computes the given mapper function using arguments
 * from each of the iterables.
 */
export function* map<T, V>(
  iterable: Iterable<T>,
  mapper: (item: T) => V,
): Iterable<V> {
  for (const value of iterable) yield mapper(value);
}
