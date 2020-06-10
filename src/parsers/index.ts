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
  private propCache = new WeakMap<postcss.Declaration, Ast.Root>();

  private valueCache = new WeakMap<postcss.Declaration, Ast.Root>();

  private importsCache = new WeakMap<postcss.AtRule, Ast.Import>();

  private exportsCache = new WeakMap<postcss.AtRule, Ast.Export>();

  private expressionCache = new WeakMap<postcss.AtRule, Ast.Expression>();

  private forConditionCache = new WeakMap<postcss.AtRule, Ast.ForCondition>();

  private trace: boolean;

  constructor({ trace }: { trace?: boolean } = {}) {
    this.trace = !!trace;
  }

  static get(root: postcss.Root): Parser {
    // @ts-ignore
    return root.__parser || (root.__parser = new Parser({ trace: true }));
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
      this.parse(decl.prop, { startRule: 'declaration' }),
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
    const tracer = this.trace ? new Tracer(input) : { trace() {} };
    try {
      return parse(input, { tracer, ...opts });
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

  forCondition(node: postcss.AtRule): Ast.ForCondition {
    return getOrAdd(this.forConditionCache, node, () =>
      this.parse(node.params, { startRule: 'for_condition' }),
    );
  }
}

export default Parser;
