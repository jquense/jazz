import type { AtRule } from 'postcss';

import Parser from '../parsers';
import * as Ast from '../parsers/Ast';
import { PostcssPlugin, PostcssProcessOptions } from '../types';
import Scope, { FunctionMember } from '../utils/Scope';
import { EXPORTS } from '../utils/Symbols';
import { isBuiltin, loadBuiltIn } from './modules';

export function transformAtFrom(
  rule: AtRule,
  opts: PostcssProcessOptions,
  parser: Parser,
) {
  const { files, from, resolve } = opts;
  const file = files[from!];

  const scope = file.scope || (file.scope = new Scope());

  const { source, specifiers } = parser.import(rule);

  let otherFile: string;
  let exports: Scope;

  if (isBuiltin(source)) {
    otherFile = source;
    exports = loadBuiltIn(source);
  } else {
    otherFile = resolve(from, source);
    exports = files[otherFile][EXPORTS];
  }

  for (const specifier of specifiers) {
    if (specifier.type === 'namespace' && exports) {
      scope.from(exports, specifier.local.name);
    }
    if (specifier.type === 'named') {
      const other = exports.get(specifier.imported);

      if (!other) {
        throw rule.error(
          `"${source}" does not export the variable $${specifier.imported.name}`,
          { word: `$${specifier.imported.name}` },
        );
      }

      scope.set(specifier.local as any, other as any, otherFile);
    }
  }
  // console.log('my', file.scope);
  rule.remove();
}

const importsPlugin: PostcssPlugin = (css, { opts }) => {
  const parser = Parser.get(css);

  css.walkAtRules('from', (rule) => {
    transformAtFrom(rule, opts, parser);
  });
};

export default importsPlugin;