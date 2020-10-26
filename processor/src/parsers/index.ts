/* eslint-disable no-return-assign */

// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import Tracer from 'pegjs-backtrace';
import postcss from 'postcss';

import * as Ast from '../Ast';
import { IParseOptions, parse } from './parser';
import { getPosition, Location } from './location';

type ParseOptions = {
  offset?: Location;
};

class Parser {
  private trace: boolean;

  private opts: any;

  constructor({ trace, ...opts }: { trace?: boolean } = {}) {
    this.opts = opts;
    this.trace = !!trace;
  }

  static get(root: postcss.Root, opts?: any): Parser {
    return (
      // @ts-ignore
      root.__parser ||
      // @ts-ignore
      (root.__parser = new Parser({ source: root.source?.input, ...opts }))
    );
  }

  value(value: string, options?: ParseOptions): Ast.Expression {
    return this.parse(value, { ...options, startRule: 'values' });
  }

  prop(
    prop: string,
    options?: ParseOptions,
  ): Ast.Ident | Ast.Variable | Ast.InterpolatedIdent {
    return this.parse(prop, {
      ...options,
      startRule: 'declaration_prop',
    });
  }

  import(params: string, options?: ParseOptions): Ast.Import {
    return this.parse(params, { ...options, startRule: 'imports' });
  }

  export(params: string, options?: ParseOptions): Ast.Export {
    return this.parse(params, { ...options, startRule: 'exports' });
  }

  parse(input: string, opts: IParseOptions) {
    const tracer =
      opts.tracer || (this.trace ? new Tracer(input) : { trace() {} });
    const parseOptions = { tracer, ...this.opts, ...opts };

    try {
      return parse(input, parseOptions);
    } catch (err) {
      if (tracer.getBacktraceString) console.log(tracer.getBacktraceString());

      if (!parseOptions.source || !err.location) throw err;

      const { source, offset } = parseOptions;
      const { line, column } = getPosition(offset, err.location.start);

      throw source?.error(err.message, line, column);
    }
  }

  expression(params: string, options?: ParseOptions): Ast.Expression {
    return this.parse(params, { ...options, startRule: 'Expression' });
  }

  eachCondition(params: string, options?: ParseOptions): Ast.EachCondition {
    return this.parse(params, {
      ...options,
      startRule: 'each_condition',
    });
  }

  callable(call: string, options?: ParseOptions): Ast.CallableDeclaration {
    const callable = this.parse(call, {
      ...options,
      startRule: 'callable_declaration',
    }) as Ast.CallableDeclaration;

    return callable;
  }

  callExpression(
    expr: string,
    isMixin = false,
    options?: ParseOptions,
  ): Ast.CallExpression {
    const callable = this.parse(expr, {
      ...options,
      startRule: 'call_expression',
      allowCallWithoutParens: isMixin,
    }) as Ast.CallExpression;

    return callable;
  }

  callExpressions(
    expr: string,
    isMixin = false,
    options?: ParseOptions,
  ): Ast.CallExpression[] {
    const callables = this.parse(expr, {
      ...options,
      startRule: 'call_expressions',
      allowCallWithoutParens: isMixin,
    });

    return callables;
  }

  composeList(expr: string, options?: ParseOptions): Ast.Composition {
    const classes = this.parse(expr, {
      ...options,
      startRule: 'compose_list',
    });

    return classes;
  }

  selector(selector: string, options?: ParseOptions) {
    return this.parse(selector, {
      ...options,
      startRule: 'selector',
    }) as Ast.SelectorList;
  }

  declarationValue(selector: string, options?: ParseOptions) {
    return this.parse(selector, {
      ...options,
      startRule: 'declaration_value',
    }) as Ast.StringTemplate;
  }

  anyValue(selector: string, options?: ParseOptions) {
    return this.parse(selector, {
      ...options,
      startRule: 'almost_any_value',
    }) as Ast.StringTemplate;
  }
}

export default Parser;