import { Message, Plugin } from 'postcss';

import type {
  ComposeAtRule,
  ExportAtRule,
  IcssImportAtRule,
  ImportAtRule,
  Root,
  UseAtRule,
} from '../Ast';
import { isBuiltin } from '../modules';
import type { BeforeModularCSSOpts } from '../types';
import {
  isComposeRule,
  isExportRule,
  isIcssImportRule,
  isImportRule,
  isUseRule,
} from '../utils/Check';
import { requestFromIcssImportRule } from '../utils/icss';

const plugin = 'jazz-dependencies';

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

type Rules =
  | ComposeAtRule
  | ImportAtRule
  | UseAtRule
  | ExportAtRule
  | IcssImportAtRule;

export function walkTree(
  css: Root,
  messages: Message[],
  { resolve, from, type }: BeforeModularCSSOpts,
) {
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
          if (!resolved) {
            throw rule.error(`Unable to locate "${source}" from "${from}"`, {
              word: source,
            });
          }

          messages.push({
            type: rule.name,
            plugin,
            request: source,
            dependency: resolved,
          });
        }),
      );
    } else {
      messages.push({
        type: rule.name,
        plugin,
        request: source,
        dependency,
      });
    }
  };

  css.walkAtRules((rule) => {
    if (type === 'css') {
      if (notAllowed.includes(rule.name))
        rule.error(`At rule ${rule.name} is not allowed in css files`);

      if (isIcssImportRule(rule)) {
        pushMessage(requestFromIcssImportRule(rule as any), rule);
        return;
      }
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
    return Promise.all(results) as any;
  }
}

const dependencyGraphPlugin: Plugin = {
  postcssPlugin: 'postcss-jazz-dependency-graph',
  Once(root: any, { result }) {
    return walkTree(
      root,
      result.messages,
      result.opts as BeforeModularCSSOpts,
    );
  },
};

export default dependencyGraphPlugin;
