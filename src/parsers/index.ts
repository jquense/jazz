/* eslint-disable no-return-assign */

// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import Tracer from 'pegjs-backtrace';
import postcss from 'postcss';

import * as Ast from '../Ast';
import { IParseOptions, parse } from './parser';

class Parser {
  private trace: boolean;

  private opts: any;

  constructor({ trace, ...opts }: { trace?: boolean } = {}) {
    this.opts = opts;
    this.trace = !!trace;
  }

  static get(root: postcss.Root, opts?: any): Parser {
    // @ts-ignore
    return root.__parser || (root.__parser = new Parser(opts));
  }

  value(decl: postcss.Declaration): Ast.Expression {
    return this.parse(decl.value, { startRule: 'values' });
  }

  prop(
    decl: postcss.Declaration,
  ): Ast.Ident | Ast.Variable | Ast.InterpolatedIdent {
    return this.parse(decl.prop, { startRule: 'declaration_prop' });
  }

  import(node: postcss.AtRule): Ast.Import {
    return this.parse(node.params, { startRule: 'imports' });
  }

  export(node: postcss.AtRule): Ast.Export {
    return this.parse(node.params, { startRule: 'exports' });
  }

  parse(input: string, opts: IParseOptions) {
    const tracer =
      opts.tracer || (this.trace ? new Tracer(input) : { trace() {} });
    try {
      return parse(input, { tracer, ...this.opts, ...opts });
    } catch (err) {
      if (tracer.getBacktraceString) console.log(tracer.getBacktraceString());
      throw err;
    }
  }

  expression(params: string): Ast.Expression {
    return this.parse(params, { startRule: 'Expression' });
  }

  eachCondition(node: postcss.AtRule): Ast.EachCondition {
    return this.parse(node.params, { startRule: 'each_condition' });
  }

  callable(call: string): Ast.CallableDeclaration {
    const callable = this.parse(call, {
      startRule: 'callable_declaration',
    }) as Ast.CallableDeclaration;

    return callable;
  }

  callExpression(expr: string, isMixin = false): Ast.CallExpression {
    const callable = this.parse(expr, {
      startRule: 'call_expression',
      allowCallWithoutParens: isMixin,
    }) as Ast.CallExpression;

    return callable;
  }

  callExpressions(expr: string, isMixin = false): Ast.CallExpression[] {
    const callables = this.parse(expr, {
      startRule: 'call_expressions',
      allowCallWithoutParens: isMixin,
    });

    return callables;
  }

  composeList(expr: string): Ast.Composition {
    const classes = this.parse(expr, {
      startRule: 'compose_list',
    });

    return classes;
  }

  selector(selector: string) {
    return this.parse(selector, { startRule: 'selector' }) as Ast.SelectorList;
  }

  declarationValue(selector: string) {
    return this.parse(selector, {
      startRule: 'declaration_value',
    }) as Ast.StringTemplate;
  }

  anyValue(selector: string) {
    return this.parse(selector, {
      startRule: 'almost_any_value',
    }) as Ast.StringTemplate;
  }
}

export default Parser;
