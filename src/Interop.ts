import * as acorn from 'acorn';

import {
  Color,
  Parameter,
  ParameterList,
  RestParameter,
  UnknownDefaultValue,
  Variable,
} from './Ast';
import {
  ArgumentListValue,
  ListValue,
  MapValue,
  NullValue,
  NumericValue,
  RgbValue,
  StringValue,
  Value,
} from './Values';
import Parser from './parsers';
import { map } from './utils/itertools';

const isValue = (node?: any): node is Value =>
  node != null && typeof node.type === 'string';

export type Param = { name: string | null; defaulted: boolean };

export type ParamsList = [Param[], string | null];

const cleanName = (name: string) => name.replace(/^\$/, '');

export function parseParameters(fn: Function): ParameterList {
  const expression = acorn.parseExpressionAt(fn.toString(), 0, {
    ecmaVersion: 11,
    allowAwaitOutsideFunction: true,
  }) as any;

  const list = new ParameterList();

  for (let param of expression.params) {
    if (param.type === 'RestElement') {
      list.rest = new RestParameter(
        new Variable(cleanName(param.argument.name)),
      );
    } else {
      let defaulted: UnknownDefaultValue | undefined;
      if (param.type === 'AssignmentPattern') {
        param = param.left;
        defaulted = new UnknownDefaultValue();
      }

      list.parameters.push(
        new Parameter(
          new Variable(
            param.type === 'Identifier' ? cleanName(param.name) : '?',
          ),
          defaulted,
        ),
      );
    }
  }
  // console.log('H', list);
  return list;
}

export function fromJs(value: unknown): Value {
  if (isValue(value)) {
    return value;
  }

  switch (typeof value) {
    // case 'function':
    //   return value as any;
    case 'number':
      return new NumericValue(value);
    case 'string':
      return Color.isValidColor(value)
        ? new RgbValue(value)
        : new StringValue(value, "'");

    case 'object': {
      if (value === null) {
        return new NullValue();
      }
      if (Array.isArray(value)) {
        return new ListValue(value.map(fromJs), ',');
      }
      if (value instanceof Map) {
        return new MapValue(
          map(value.entries(), ([k, v]) => [fromJs(k), fromJs(v)]),
        );
      }
      return new MapValue(
        Object.entries(value).map(([k, v]) => [fromJs(k), fromJs(v)]),
      );
    }
    default:
      throw new Error(`unknown value type ${value}`);
  }
}

// function matchParameters(
//   [names, spread]: ParamsList,
//   positionals: Value[],
//   keywords: Map<string, Value>,
// ) {
//   const params = [] as any[];

//   for (const { name, defaulted } of names) {
//     if (name) {
//       if (keywords.has(name)) {
//         params.push(keywords.get(name));
//         keywords.delete(name);
//         continue;
//       }

//       if (name.startsWith('$')) {
//         const other = name.slice(1);
//         if (keywords.has(other)) {
//           params.push(keywords.get(other));
//           keywords.delete(other);
//           continue;
//         }
//       }
//     }

//     const positional = positionals.shift();
//     if (positional) {
//       params.push(positional);
//     } else if (defaulted) {
//       params.push(undefined);
//     } else {
//       console.warn(`Missing parameter: ${name}`);
//     }
//   }

//   if (keywords.size) console.warn(`unused keyword arguments `, keywords);
//   if (positionals.length) {
//     if (spread) params.push(...positionals);
//     else console.warn(`unused keyword arguments: ${positionals.join(', ')}`);
//   }

//   return params;
// }

const parser = new Parser();

export interface ResolvedArguments {
  positionals: Value[];
  keywords: Record<string, Value>;
}

export type ResolvedParameters = Record<string, Value | undefined>;

export class Callable extends Function {
  static create(
    name: string,
    parameters: string,
    func: (specified: Record<string, Value | undefined>) => Value | void,
  ): Callable {
    const { params } = parser.callable(`${name}(${parameters!})`);

    return new Callable(name, params, func!, false);
  }

  static fromFunction(
    name: string | undefined,
    func: (...any: Value[]) => Value | void,
  ): Callable {
    return new Callable(name ?? func.name, parseParameters(func), func, true);
  }

  constructor(
    name: string,
    public params: ParameterList,
    public fn: Function,
    private spreadArgs: boolean,
  ) {
    super();
    Object.defineProperty(this, 'name', {
      value: name,
    });

    return new Proxy(this, {
      apply(target, _this: any, [args]: [ResolvedParameters]) {
        return target.call(args);
      },
    });
  }

  call(args: ResolvedParameters) {
    const { parameters, rest } = this.params;
    if (this.spreadArgs) {
      const array = [] as Array<Value | undefined>;
      parameters.forEach(({ name }) => {
        array.push(args[name.name]);
      });

      if (rest) {
        const restValues = args[rest.name.name] as
          | ArgumentListValue
          | undefined;
        if (restValues) {
          if (restValues.keywords.size) {
            throw new SyntaxError(
              `No argument(s) named ${Object.keys(restValues.keywords).join(
                ', ',
              )}`,
            );
          }

          array.push(...(restValues as any));
        }
      }

      return this.fn(...array);
    }

    return this.fn(args);
  }
}
