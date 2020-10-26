import { Value } from '../Values';

export default function breakOnReturn<T>(
  nodes: T[],
  fn: (value: T) => Value | void,
): Value | void {
  for (const item of nodes) {
    const result = fn(item);
    if (result) return result;
  }
}
