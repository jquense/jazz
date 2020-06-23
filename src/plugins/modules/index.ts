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

function convertValue(value: unknown): Ast.ReducedExpression {
  if (Ast.isNode(value)) {
    if (!isValueNode(value)) {
      throw new Error(`bad exported value ${value.type}`);
    }

    return value;
  }

  switch (typeof value) {
    // case 'function':
    //   return value as any;
    case 'number':
      return new Ast.Numeric(value);
    case 'string':
      return Ast.Color.isValidColor(value)
        ? new Ast.Color(value)
        : new Ast.StringLiteral(value, Ast.SINGLE);

    case 'object': {
      if (value === null) {
        return new Ast.NullLiteral();
      }
      if (Array.isArray(value)) {
        return new Ast.List(value.map(convertValue), ',');
      }
      return new Ast.Map(
        Object.entries(value).map(([k, v]) => [
          convertValue(k),
          convertValue(v),
        ]),
      );
    }
    default:
      throw new Error(`unknown value type ${value}`);
  }
}

export const moduleToScope = (mod: Record<string, any>) => {
  const scope = new Scope();

  for (const [name, value] of Object.entries(mod)) {
    if (name.startsWith('_')) continue;

    if (typeof value === 'function') {
      scope.setFunction(name, value);
    } else {
      scope.setVariable(name, convertValue(value));
    }
  }

  return scope;
};

export const loadBuiltIn = (file: string) => {
  const module = require(`./${file}`);

  return moduleToScope(module);
};
