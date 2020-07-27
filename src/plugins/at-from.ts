import * as Ast from '../Ast';
import ModuleMembers from '../ModuleMembers';
import Scope from '../Scope';
import { isBuiltin, loadBuiltIn } from '../modules';
import { PostcssPlugin, PostcssProcessOptions } from '../types';

export function transformAtFrom(
  rule: Ast.FromAtRule,
  opts: PostcssProcessOptions,
) {
  const { modules, from, resolve } = opts;
  const file = modules.get(from!)!;

  const scope = file.scope || (file.scope = new Scope());

  const { request, specifiers } = rule;

  let otherFile: string;
  let exports: ModuleMembers;

  if (isBuiltin(request)) {
    otherFile = request;
    exports = loadBuiltIn(request);
  } else {
    otherFile = resolve(from, request);
    exports = modules.get(otherFile)!.exports;
  }

  for (const specifier of specifiers) {
    if (specifier.type === 'namespace' && exports) {
      scope.addAll(exports, specifier.local.value);
    }
    if (specifier.type === 'named') {
      const other = exports.get(specifier.imported);

      if (!other) {
        throw rule.error(
          `"${request}" does not export ${specifier.imported}`,
          {
            word: `${specifier.imported}`,
          },
        );
      }

      scope.set(specifier.local, { ...other, source: otherFile });
    }
  }

  rule.remove();
}

const importsPlugin: PostcssPlugin = (css, { opts }) => {
  css.walkAtRules('from', (rule) => {
    transformAtFrom(rule as any, opts);
  });
};

export default importsPlugin;
