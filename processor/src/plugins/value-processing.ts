/* eslint-disable @typescript-eslint/no-use-before-define */

import path from 'path';

// @ts-ignore
import slug from 'unique-slug';

import Evaluator from '../Evaluate';
import Parser from '../parsers';
import type { PostcssPlugin } from '../types';

const defaultNamer = (filename: string, selector: string) => {
  // return `i_${selector}`;
  return `mc${slug(
    path.relative(process.cwd(), filename!).replace(/\\/g, '/'),
  )}_${selector}`;
};

const valueProcessingPlugin: PostcssPlugin = (css, { opts }) => {
  const {
    modules,
    from,
    resolve,
    identifierScope,
    icssCompatible,
    namer = defaultNamer,
  } = opts;

  const module = modules.get(from!)!;

  const parser = Parser.get(css, opts);

  const members = Evaluator.evaluate(css, {
    outputIcss: icssCompatible,
    namer: (str: string) => namer(from!, str),
    loadModule: (request: string) => {
      const resolved = resolve(request);

      return {
        module: resolved ? modules.get(resolved) : undefined,
        // FIXME: this is weird here, if it's absolute tho tests are hard
        resolved: resolved && path.relative(path.dirname(from), resolved),
      };
    },
    initialScope: module.scope,
    identifierScope,
    parser,
  });

  module.exports.addAll(members);
};

// importsPlugin.postcssPlugin = 'modular-css-values-local';

export default valueProcessingPlugin;
