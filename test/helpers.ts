/* eslint-disable @typescript-eslint/no-var-requires */
import path from 'path';

import postcss from 'postcss';

import {
  ClassSelector,
  IdSelector,
  Ident,
  TypeSelector,
  UniversalSelector,
} from '../src/Ast';
import ModuleMembers from '../src/ModuleMembers';
import Scope from '../src/Scope';
import atExport from '../src/plugins/at-export';
import atFrom from '../src/plugins/at-from';
import valuePlugin from '../src/plugins/value-processing';
import { Module, PostcssProcessOptions } from '../src/types';
import interleave from '../src/utils/interleave';

export const css = (strings: TemplateStringsArray, ...values: any[]) => {
  return interleave(strings, values).join('');
};

interface Options {
  hash?: boolean;
  scope?: Scope;
  exports?: ModuleMembers;
  modules?: [string, Module][];
}

export async function process(cssStr: string, options: Options = {}) {
  const {
    scope = new Scope(),
    exports = new ModuleMembers(),
    hash = false,
    modules = [],
  } = options;

  const postcssOptions: Partial<PostcssProcessOptions> = {
    parser: require('../src/parsers/postcss').default,
    from: './test.js',
    source: false,
    trace: true,
    resolve: (from: string, to: string) => {
      return path.join(path.dirname(from), to);
    },
    namer: (_: string, s: string) => (hash ? `h_${s}` : s),
    modules: new Map([
      [
        './test.js',
        {
          scope,
          exports,
        },
      ],
      ...modules,
    ]),
  };

  const result = await postcss([atFrom, valuePlugin, atExport]).process(
    cssStr,
    postcssOptions,
  );
  return { css: result.css, scope, exports };
}

export async function evaluate(
  cssStr: string,
  scopeOrOptions?: Scope | Options,
) {
  const { css: result } = await process(
    cssStr,
    scopeOrOptions instanceof Scope
      ? { scope: scopeOrOptions }
      : scopeOrOptions || {},
  );

  return result;
}

export const Selectors = {
  type: ([str]: TemplateStringsArray) => new TypeSelector(new Ident(str)),
  id: ([str]: TemplateStringsArray) => new IdSelector(new Ident(str)),
  class: ([str]: TemplateStringsArray) => new ClassSelector(new Ident(str)),
  star: () => new UniversalSelector(),
};
