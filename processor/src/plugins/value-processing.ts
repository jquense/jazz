/* eslint-disable @typescript-eslint/no-use-before-define */

import path from 'path';

import { Plugin } from 'postcss';
// @ts-ignore
import slug from 'unique-slug';

import { Root } from '../Ast';
import Evaluator from '../Evaluate';
import Parser from '../parsers';
import type { ModularCSSOpts } from '../types';

export const defaultNamer = (filename: string, selector: string) => {
  // return `i_${selector}`;
  return `jz${slug(
    path.relative(process.cwd(), filename!).replace(/\\/g, '/'),
  )}_${selector}`;
};

const valueProcessingPlugin: Plugin = {
  postcssPlugin: 'postcss-jazzcss',
  OnceExit(root, { result }) {
    const css: Root = root as any;
    const {
      modules,
      from,
      resolve,
      identifierScope,
      // icssCompatible,
      namer = defaultNamer,
    } = result.opts as ModularCSSOpts;

    const module = modules.get(from!)!;

    const parser = Parser.get(css, result.opts as ModularCSSOpts);

    const { exports, icss } = Evaluator.evaluate(css, {
      // outputIcss: icssCompatible,
      isCss: module!.type === 'css',
      namer: (str: string) => namer(from!, str),
      loadModule: (request: string) => {
        const resolved = resolve(request);

        return {
          module: resolved ? modules.get(resolved) : undefined,
          // FIXME: this is weird here, if it's absolute tho tests are hard
          resolved, // && path.relative(path.dirname(from), resolved),
        };
      },
      initialScope: module.scope,
      identifierScope,
      parser,
    });

    module.icss = icss;
    module.exports.addAll(exports);
  },
};

export default valueProcessingPlugin;
