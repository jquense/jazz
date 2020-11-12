import type {
  ComposeAtRule,
  ExportAtRule,
  ImportAtRule,
  Root,
  StatementNode,
  UseAtRule,
} from '../Ast';
import { isBuiltin } from '../modules';
import type { BeforeModularCSSOpts, PostcssPlugin } from '../types';

const plugin = 'jazz-dependencies';

const isImportRule = (n: StatementNode): n is ImportAtRule =>
  n.type === 'atrule' && n.name === 'import';

const isUseRule = (n: StatementNode): n is UseAtRule =>
  n.type === 'atrule' && n.name === 'use';

const isExportRule = (n: StatementNode): n is ExportAtRule =>
  n.type === 'atrule' && n.name === 'export';

const isComposeRule = (n: StatementNode): n is ComposeAtRule =>
  n.type === 'atrule' && n.name === 'compose';

const isPromise = <T>(value: any | Promise<T>): value is Promise<T> =>
  typeof value === 'object' && value && 'then' in value;

const notAllowed = [
  'use',
  'export',
  'compose',
  'return',
  'else',
  'function',
  'mixin',
  'include',
  'if',
  'else if',
  'else',
];

type Rules = ComposeAtRule | ImportAtRule | UseAtRule | ExportAtRule;

const dependencyGraphPlugin: PostcssPlugin = (css: Root, result) => {
  const { resolve, from, modules } = result.opts as BeforeModularCSSOpts;

  const { type } = modules.get(from)!;

  const results = [] as Promise<void>[];

  const pushMessage = (source: string | null | undefined, rule: Rules) => {
    if (!source) {
      return;
    }

    const dependency = resolve(source);

    if (!dependency) {
      throw rule.error(`Unable to locate "${source}" from "${from}"`, {
        word: source,
      });
    }
    if (isPromise(dependency)) {
      results.push(
        dependency.then((resolved) => {
          if (!result) {
            throw rule.error(`Unable to locate "${source}" from "${from}"`, {
              word: source,
            });
          }

          result.messages.push({
            type: rule.name,
            plugin,
            request: source,
            dependency: resolved,
          });
        }),
      );
    } else {
      result.messages.push({
        type: rule.name,
        plugin,
        request: source,
        dependency,
      });
    }
  };

  css.walkAtRules((rule) => {
    if (type === 'css' && notAllowed.includes(rule.name)) {
      rule.error(`At rule ${rule.name} is not allowed in css files`);
    }

    if (
      isImportRule(rule) ||
      isExportRule(rule) ||
      isComposeRule(rule) ||
      (isUseRule(rule) && !isBuiltin(rule.request))
    ) {
      pushMessage(rule.request, rule);
    }
  });

  if (results.length) {
    return Promise.all(results);
  }
};

export default dependencyGraphPlugin;
