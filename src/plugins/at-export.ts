import Parser from '../parsers';
import * as Ast from '../parsers/Ast';
import { PostcssPlugin } from '../types';
import Scope from '../utils/Scope';
import { EXPORTS } from '../utils/Symbols';

const exportsPlugin: PostcssPlugin = (css, { opts }) => {
  const { files, from, resolve } = opts;
  const file = files[from!];

  const { scope } = file;

  const parser = Parser.get(css);

  const exports = file[EXPORTS] || (file[EXPORTS] = new Scope());

  css.walkAtRules('export', (rule) => {
    const parsed: Ast.Export = parser.export(rule);

    if (!parsed.source) {
      for (const {
        exported,
        local,
      } of parsed.specifiers as Ast.ExportSpecifier[]) {
        const value = scope.get(local);

        if (!value) {
          throw rule.error(`There is no local ${local.toString()} declared.`);
        }

        exports.set(exported, { ...value });
      }
      rule.remove();
      return;
    }

    const source = files[resolve(from, parsed.source)];

    for (const specifier of parsed.specifiers) {
      const otherExports = source[EXPORTS];

      // if (!otherExports || !Object.keys(otherExports).length) {
      //   throw rule.error(`"${parsed.source}" does not export anything`);
      // }

      if (specifier.type === 'all') {
        exports.from(otherExports);
      }

      if (specifier.type === 'named') {
        const other = otherExports.get(specifier.local);

        if (!other) {
          throw rule.error(
            `"${parsed.source}" does not export ${specifier.local}`,
          );
        }

        exports.set(specifier.exported, { ...other, source: parsed.source });
      }
    }

    rule.remove();
  });
};

exportsPlugin.postcssPlugin = 'exports';

export default exportsPlugin;
