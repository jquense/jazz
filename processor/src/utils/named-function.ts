export function namedFunction<T extends (...args: any[]) => any>(
  name: string,
  fn: T,
): T {
  Object.defineProperty(fn, 'name', {
    value: name,
  });

  return fn;
}
