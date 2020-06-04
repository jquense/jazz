/* eslint-disable no-return-assign */
import postcss from 'postcss';

import * as Ast from './Ast';
import { IParseOptions, parse } from './parser';

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

  static get(root: postcss.Root): Parser {
    // @ts-ignore
    return root.__parser || (root.__parser = new Parser());
  }

  value(decl: postcss.Declaration) {
    return getOrAdd(
      this.valueCache,
      decl,
      () => new Ast.Root(this.parse(decl.value, { startRule: 'values' })),
    );
  }

  prop(decl: postcss.Declaration) {
    return getOrAdd(
      this.propCache,
      decl,
      () => new Ast.Root(this.parse(decl.prop, { startRule: 'declaration' })),
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
    return parse(input, opts);
  }
}

export default Parser;
