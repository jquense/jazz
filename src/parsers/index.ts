/* eslint-disable no-return-assign */

// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import Tracer from 'pegjs-backtrace';
import postcss from 'postcss';

import * as Ast from './Ast';
import { IParseOptions, parse } from './parser';
// @ts-ignore

function getOrAdd<T extends postcss.Node, U>(
  map: WeakMap<T, U>,
  key: T,
  factory: () => U,
): U {
  let value = map.get(key);
  if (!map.has(key)) {
    value = factory();
    map.set(key, value);
  }
  return value!;
}

class Parser {
  private propCache = new WeakMap<postcss.Declaration, Ast.DeclarationValue>();

  private valueCache = new WeakMap<
    postcss.Declaration,
    Ast.DeclarationValue
  >();

  private importsCache = new WeakMap<postcss.AtRule, Ast.Import>();

  private exportsCache = new WeakMap<postcss.AtRule, Ast.Export>();

  private expressionCache = new WeakMap<postcss.AtRule, Ast.Expression>();

  private forConditionCache = new WeakMap<postcss.AtRule, Ast.ForCondition>();

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

  value(decl: postcss.Declaration) {
    return getOrAdd(
      this.valueCache,
      decl,
      () =>
        new Ast.DeclarationValue(
          this.parse(decl.value, { startRule: 'values' }),
        ),
    );
  }

  prop(decl: postcss.Declaration) {
    return getOrAdd(this.propCache, decl, () =>
      this.parse(decl.prop, { startRule: 'declaration_prop' }),
    );
  }

  import(node: postcss.AtRule): Ast.Import {
    return getOrAdd(this.importsCache, node, () =>
      this.parse(node.params, { startRule: 'imports' }),
    );
  }

  export(node: postcss.AtRule): Ast.Export {
    return getOrAdd(this.exportsCache, node, () =>
      this.parse(node.params, { startRule: 'exports' }),
    );
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

  expression(node: postcss.AtRule): Ast.Expression {
    return getOrAdd(this.expressionCache, node, () =>
      this.parse(node.params, { startRule: 'Expression' }),
    );
  }

  eachCondition(node: postcss.AtRule): Ast.EachCondition {
    return getOrAdd(this.forConditionCache, node, () =>
      this.parse(node.params, { startRule: 'each_condition' }),
    );
  }

  forCondition(node: postcss.AtRule): Ast.ForCondition {
    return getOrAdd(this.forConditionCache, node, () =>
      this.parse(node.params, { startRule: 'for_condition' }),
    );
  }

  callable(node: postcss.AtRule): Ast.CallableDeclaration {
    const callable = this.parse(node.params, {
      startRule: 'callable_declaration',
    }) as Ast.CallableDeclaration;

    callable.body = node.nodes!.map((n) => n.remove());
    return callable;
  }

  callExpression(expr: string): Ast.CallExpression {
    const callable = this.parse(expr, {
      startRule: 'call_expression',
    }) as Ast.CallExpression;

    return callable;
  }

  selector(selector: string) {
    return this.parse(selector, { startRule: 'selector' }) as Ast.SelectorList;
  }
}

export default Parser;
