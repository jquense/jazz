export default function interleave<T>(
  strings: readonly string[],
  interpolations: readonly T[],
): Array<T | string> {
  const result: Array<T | string> = [strings[0]];

  for (let i = 0, len = interpolations.length; i < len; i++) {
    result.push(interpolations[i], strings[i + 1]);
  }

  return result;
}
