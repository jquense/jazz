function remove<K extends number, V>(col: Array<V>, key: K): V | undefined;
function remove<K, V>(col: Map<K, V>, key: K): V | undefined;
function remove<K, V>(col: Array<V> | Map<K, V>, key: K) {
  if (Array.isArray(col)) return col.splice(key as any, 1)[0];

  const r = col.get(key);
  col.delete(key);
  return r;
}

function keys<K>(col: {} | { keys(): Iterable<K> }) {
  if (col instanceof Set || col instanceof Map)
    return Array.from<K>(col.keys());

  return Object.keys(col);
}

function toMap<T>(obj: Record<string, T>) {
  return new Map(Object.entries(obj));
}

function toSet<T>(obj: Record<string, T> | Map<any, T>) {
  return new Set(obj instanceof Map ? obj.entries() : Object.entries(obj));
}

export { remove, keys, toMap, toSet };
