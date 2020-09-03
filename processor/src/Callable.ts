import { ParameterList } from './Ast';
import { parseParameters } from './Interop';
import { ArgumentListValue, Value } from './Values';
import Parser from './parsers';

const parser = new Parser();

export interface ResolvedArguments {
  positionals: Value[];
  keywords: Record<string, Value>;
}

export type ResolvedParameters = Record<string, Value | undefined>;

// export interface Callable {
//   new (...args: any[]): (args: ResolvedArguments) => void;
// }

type Func<TArgs extends ResolvedParameters, TReturn extends Value | void> = (
  specified: TArgs,
) => TReturn;

type SpreadFunc<T extends Value | void> = (...any: Value[]) => T;

interface Options<T extends (...args: any) => any> {
  name: string;
  params: ParameterList;
  fn: T;
  spreadArgs: boolean;
}

function paramify<T extends (...args: any) => any>({
  name,
  spreadArgs,
  params,
  fn,
}: Options<T>) {
  function wrapped(
    args: ResolvedParameters,
    // visitor?: ExpressionVisitor<Value>,
  ): ReturnType<T> {
    const { parameters, rest } = params;

    if (!spreadArgs) {
      return fn(args);
    }

    const array = [] as Array<Value | undefined>;
    parameters.forEach((p) => {
      array.push(args[p.name.name]);
    });

    if (rest) {
      const restValues = args[rest.name.name] as ArgumentListValue | undefined;

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

    return fn(...array);
  }

  Object.defineProperty(wrapped, 'name', {
    value: name,
  });

  return wrapped;
}

type ParamifiedFunc<T extends (...args: any) => any> = (
  args: ResolvedParameters,
) => ReturnType<T>;

function create<TReturn extends Value>(
  fn: SpreadFunc<TReturn>,
): ParamifiedFunc<SpreadFunc<TReturn>>;
function create<TReturn extends Value>(
  name: string,
  fn: SpreadFunc<TReturn>,
): ParamifiedFunc<SpreadFunc<TReturn>>;
function create<TArgs extends ResolvedParameters, TReturn extends Value>(
  name: string,
  parameters: string,
  fn: Func<TArgs, TReturn>,
): ParamifiedFunc<Func<TArgs, TReturn>>;

function create<TReturn extends Value>(
  name: string | SpreadFunc<TReturn>,
  parameters?: string | SpreadFunc<TReturn>,
  fn?: Func<ResolvedParameters, TReturn>,
) {
  let func: SpreadFunc<TReturn> | Func<ResolvedParameters, TReturn>;
  let params: ParameterList;
  if (typeof name === 'function') {
    func = name;
    name = func.name;
    params = parseParameters(func);
  } else if (typeof parameters === 'function') {
    if (typeof name !== 'string') {
      throw new Error('Name must be a string');
    }
    func = parameters;
    params = parseParameters(func);
  } else {
    if (typeof name !== 'string') throw new Error('Name must be a string');
    if (typeof parameters !== 'string')
      throw new Error('Parameters must be a string');
    if (typeof fn !== 'function') throw new Error('fn must be a Function');
    ({ params } = parser.callable(`${name}(${parameters!})`));
    func = fn;
  }

  return paramify({ name, params, fn: func, spreadArgs: false });
}

export { create };

// function mixin(parent, params) {

// }

// const f = create(
//   'foo',
//   'fsaf',
//   ({ foo }: { foo: NumericValue }) => new NumericValue(1),
// );
