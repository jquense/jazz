// @ts-ignore
// import mcssGraph from '@modular-css/processor/plugins/before/graph-nodes';
import type postcss from 'postcss';

import { ComposeAtRule, ExportAtRule, UseAtRule, StatementNode } from '../Ast';
import { PostcssPlugin, BeforeModularCSSOpts } from '../types';

const plugin = 'modular-css-graph-nodes';

const isUseRule = (n: StatementNode): n is UseAtRule =>
  n.type === 'atrule' && n.name === 'use';

const isExportRule = (n: StatementNode): n is ExportAtRule =>
  n.type === 'atrule' && n.name === 'export';

const isComposeRule = (n: StatementNode): n is ComposeAtRule =>
  n.type === 'atrule' && n.name === 'compose';

const isPromise = <T>(value: any | Promise<T>): value is Promise<T> =>
  typeof value === 'object' && value && 'then' in value;

const dependencyGraphPlugin: PostcssPlugin = (css, result) => {
  const { resolve, from } = result.opts as BeforeModularCSSOpts;

  let results = [] as Promise<void>[];

  const pushMessage = (source: string | undefined, rule: postcss.Node) => {
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
            type: 'unanmed-css-processor',
            plugin,
            request: source,
            dependency: resolved,
          });
        }),
      );
    } else {
      result.messages.push({
        type: 'unanmed-css-processor',
        plugin,
        request: source,
        dependency,
      });
    }
  };

  css.walkAtRules((rule: postcss.AtRule) => {
    if (isExportRule(rule) || isUseRule(rule) || isComposeRule(rule)) {
      pushMessage(rule.request, rule);
    }
  });

  if (results.length) {
    return Promise.all(results);
  }
};

export default dependencyGraphPlugin;
