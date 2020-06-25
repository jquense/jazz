import * as acorn from 'acorn';

import * as Ast from '../parsers/Ast';
import { map } from './itertools';

export type Param = { name: string | null; defaulted: boolean };

export type ParamsList = [Param[], string | null];

export function parseParameters(fn: Function): ParamsList {
  const expression = acorn.parseExpressionAt(fn.toString(), 0, {
    ecmaVersion: 11,
    allowAwaitOutsideFunction: true,
  }) as any;

  const params = [] as Param[];
  let rest: null | string = null;

  for (let param of expression.params) {
    if (param.type === 'RestElement') {
      rest = param.argument.name ?? null;
    } else {
      let defaulted = false;
      if (param.type === 'AssignmentPattern') {
        param = param.left;
        defaulted = true;
      }
      if (param.type === 'Identifier') {
        params.push({ name: param.name, defaulted });
      } else {
        params.push({ name: null, defaulted });
      }
    }
  }
  return [params, rest];
}

export const isValueNode = (node: Ast.Node) =>
  node.type === 'string' ||
  node.type === 'numeric' ||
  node.type === 'ident' ||
  node.type === 'color' ||
  node.type === 'url';

export function fromJs(value: unknown): Ast.ReducedExpression {
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
        return new Ast.List(value.map(fromJs), ',');
      }
      return new Ast.Map(
        Object.entries(value).map(([k, v]) => [fromJs(k), fromJs(v)]),
      );
    }
    default:
      throw new Error(`unknown value type ${value}`);
  }
}

export function matchParameters(
  [names, spread]: ParamsList,
  args: Ast.ArgumentList,
) {
  const positionals = args.nodes.slice();
  const kwargs = new Map(
    map(args.keywords.entries(), ([k, value]) => [k.toString(), value]),
  );

  const params = [] as any[];

  for (const { name, defaulted } of names) {
    if (name) {
      if (kwargs.has(name)) {
        params.push(kwargs.get(name));
        kwargs.delete(name);
        continue;
      }

      if (name.startsWith('$')) {
        const other = name.slice(1);
        if (kwargs.has(other)) {
          params.push(kwargs.get(other));
          kwargs.delete(other);
          continue;
        }
      }
    }

    const positional = positionals.shift();
    if (positional) {
      params.push(positional);
    } else if (defaulted) {
      params.push(undefined);
    } else {
      console.warn(`Missing parameter: ${name}`);
    }
  }

  if (kwargs.size) console.warn(`unused keyword arguments `, kwargs);
  if (positionals.length) {
    if (spread) params.push(...positionals);
    else console.warn(`unused keyword arguments: ${positionals.join(', ')}`);
  }
  console.log(params);
  return params;
}

export function call(fn: Function, args: Ast.ArgumentList) {
  const params = matchParameters(parseParameters(fn), args);
  return fn(...params);
}
