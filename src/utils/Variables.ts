const matchVar = /(?<!\\)(?:([a-zA-Z][\w-]*\.)?\$([a-zA-Z][\w-]*)|#\{(.+)\})/g;

export const isVariableDeclaration = (prop: string) => /^\$[\w-]+$/.test(prop);

export const isInvalidVariableInterpolation = (prop: string) =>
  /^\$[\w-]+$/.test(prop);

export function* getVariables(str: string): Iterable<string> {
  for (const [, ns = '', name, interpolation] of str.matchAll(matchVar)) {
    if (name) yield `${ns}${name}`;
    if (interpolation) yield* getVariables(interpolation);
  }
}

const error = (msg: string, node: any) => {
  return node ? node.error(msg) : new Error(msg);
};

export function replaceWithValue(
  str: string,
  values: Record<string, { value: any }>,
  location: 'string' | 'identifier' | 'value' = 'value',
  node?: { error(msg: string): Error },
): string {
  return str.replace(
    matchVar,
    (match, namespace = '', varName?: string, interpolation?: string) => {
      if (interpolation) {
        return replaceWithValue(interpolation, values);
      }

      if (!varName || location === 'string') return match;

      if (location === 'identifier') {
        throw error(
          `Unexpected variable location, use interpolation: #{$${varName}}`,
          node,
        );
      }

      const name = namespace + varName;
      if (name in values) {
        const { value } = values[name];

        return Array.isArray(value) ? value.join(', ') : String(value);
      }

      throw error(`Unresolved variable: $${name}`, node);
    },
  );
}
