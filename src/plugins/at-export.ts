import * as Ast from '../Ast';
import { PostcssPlugin } from '../types';

const exportsPlugin: PostcssPlugin = (css, { opts }) => {
  // const { modules, from, resolve } = opts;
  // const file = modules.get(from!)!;
  // const { scope } = file;
  // const { exports } = file;
  // css.walkAtRules('export', (rule: Ast.ExportAtRule) => {
  // if (!rule.request) {
  //   for (const {
  //     exported,
  //     local,
  //   } of rule.specifiers as Ast.ExportSpecifier[]) {
  //     const value = scope.get(local);
  //     if (!value) {
  //       throw rule.error(`There is no local ${local.toString()} declared.`);
  //     }
  //     exports.set(exported, { ...value });
  //   }
  //   rule.remove();
  //   return;
  // }
  // const source = modules.get(resolve(from, rule.request))!;
  // for (const specifier of rule.specifiers) {
  //   const otherExports = source.exports;
  //   // if (!otherExports || !Object.keys(otherExports).length) {
  //   //   throw rule.error(`"${rule.request}" does not export anything`);
  //   // }
  //   if (specifier.type === 'all') {
  //     exports.addAll(otherExports);
  //   }
  //   if (specifier.type === 'named') {
  //     const other = otherExports.get(`${specifier.local}`);
  //     if (!other) {
  //       throw rule.error(
  //         `"${rule.request}" does not export ${specifier.local}`,
  //       );
  //     }
  //     exports.set(specifier.exported, {
  //       ...other,
  //       source: rule.request,
  //     });
  //   }
  // }
  //   rule.remove();
  // });
};

exportsPlugin.postcssPlugin = 'exports';

export default exportsPlugin;
