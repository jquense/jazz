/* eslint-disable @typescript-eslint/no-var-requires */

import * as Ast from '../../parsers/Ast';
import Scope from '../../utils/Scope';

export const isBuiltin = (source: string) =>
  source === 'color' || source === 'math';

export const isValueNode = (node: Ast.Node) =>
  node.type === 'string' ||
  node.type === 'numeric' ||
  node.type === 'ident' ||
  node.type === 'color' ||
  node.type === 'url';

export const moduleToScope = (mod: Record<string, any>) => {
  const scope = new Scope();

  for (const [name, value] of Object.entries(mod)) {
    if (name.startsWith('_')) continue;

    if (Ast.isNode(value)) {
      if (!isValueNode(value)) {
        throw new Error(`bad exported value ${value.type}`);
      }

      scope.setVariable(name, value as any);
      continue;
    }

    switch (typeof value) {
      case 'function':
        scope.setFunction(name, value);
        break;
      case 'number':
        scope.setVariable(name, new Ast.Numeric(value));
        break;
      case 'string':
        scope.setVariable(
          name,
          Ast.Color.isValidColor(value)
            ? new Ast.Color(value)
            : new Ast.StringLiteral(value, Ast.SINGLE),
        );
        break;

      default:
        throw new Error(`unknown value type ${value}`);
    }
  }

  return scope;
};

export const loadBuiltIn = (file: string) => {
  const module = require(`./${file}`);

  return moduleToScope(module);
};
